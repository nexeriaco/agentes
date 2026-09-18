const supabase = require('../supabase/client');
const {
  buscarUrl,
  toClaudeResult,
  unpackFullTextCache,
} = require('./urlTool');

// Tiempo de validez por defecto cuando la fila de agent_instructions no
// especifica horas_cache_pagina (o la URL no corresponde a ninguna fila,
// p.ej. un documento descubierto dentro de una página).
const DEFAULT_CACHE_HOURS = 4;

// Busca si la URL coincide con la associated_url de alguna instrucción
// activa de este agente, para usar su horas_cache_pagina si la tiene.
async function getCacheHoursForUrl(agentId, url) {
  const { data, error } = await supabase
    .from('agent_instructions')
    .select('horas_cache_pagina')
    .eq('agent_id', agentId)
    .eq('associated_url', url)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data && data.horas_cache_pagina) || DEFAULT_CACHE_HOURS;
}

async function getCachedContent(agentId, url) {
  const { data, error } = await supabase
    .from('page_cache')
    .select('content, fecha_consulta')
    .eq('url', url)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cacheHours = await getCacheHoursForUrl(agentId, url);
  const ageMs = Date.now() - new Date(data.fecha_consulta).getTime();
  if (ageMs > cacheHours * 60 * 60 * 1000) return null;

  return data.content;
}

async function saveToCache(url, content) {
  const { error } = await supabase
    .from('page_cache')
    .upsert({ url, content, fecha_consulta: new Date().toISOString() }, { onConflict: 'url' });

  if (error) throw error;
}

function inferKindFromContent(content) {
  if (!Array.isArray(content) || content.length === 0) return 'link';
  if (content.some((block) => block.type === 'image')) return 'pdf';

  const unpacked = unpackFullTextCache(content);
  if (unpacked && unpacked.kind) return unpacked.kind;

  const text = (content.find((block) => block.type === 'text') || {}).text || '';
  if (text.startsWith('Texto extraído del PDF') || text.startsWith('El PDF ')) return 'pdf';
  if (text.startsWith('Contenido de la página') || text.startsWith('Extractos relevantes')) return 'link';
  if (
    text.startsWith('No se pudo')
    || text.includes('no se puede procesar')
    || text.includes('No se pudo acceder')
  ) {
    return 'error';
  }
  return 'link';
}

// Aplica chunk+rank sobre una entrada de caché (V2 o legacy) y construye
// el tool_result que verá Claude. query es la pregunta del ciudadano.
function serveFromCache(url, cachedContent, query) {
  const unpacked = unpackFullTextCache(cachedContent);
  if (!unpacked) {
    return { content: cachedContent, kind: inferKindFromContent(cachedContent) };
  }

  if (unpacked.content && !unpacked.fullText) {
    return { content: unpacked.content, kind: unpacked.kind || 'pdf' };
  }

  return toClaudeResult(url, { kind: unpacked.kind || 'link', fullText: unpacked.fullText }, query);
}

// true si la entrada es del formato anterior (ya truncada a ~15k): forzamos
// refetch para rellenar PAGE_CACHE_V2 con el texto completo.
function isLegacyCache(cachedContent) {
  const unpacked = unpackFullTextCache(cachedContent);
  return Boolean(unpacked && unpacked.legacy);
}

// Envoltorio de buscarUrl con caché: guarda el texto COMPLETO de la URL;
// el filtrado por pregunta (chunk + rank) se aplica al servir, para que
// distintas consultas sobre la misma página obtengan extractos distintos.
// Un fallo guardando en caché no debe romper la respuesta ya obtenida.
async function buscarUrlConCache(agentId, url, query = '', policy = null) {
  const cached = await getCachedContent(agentId, url);
  if (cached && !isLegacyCache(cached)) return serveFromCache(url, cached, query);

  const result = await buscarUrl(url, policy);
  // result.content ya viene empaquetado (PAGE_CACHE_V2) o es PDF escaneado/error.
  saveToCache(url, result.content).catch((err) => console.error('Error guardando caché de página:', err));

  if (result.fullText != null) {
    return toClaudeResult(url, { kind: result.kind, fullText: result.fullText }, query);
  }
  return { content: result.content, kind: result.kind || 'link' };
}

module.exports = { buscarUrlConCache };
