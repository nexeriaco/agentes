const supabase = require('../supabase/client');
const { buscarUrl } = require('./urlTool');

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

// La caché solo guarda content; el kind se infiere de los prefijos que
// escribe urlTool (o de si hay bloques imagen = PDF escaneado).
function inferKindFromContent(content) {
  if (!Array.isArray(content) || content.length === 0) return 'link';
  if (content.some((block) => block.type === 'image')) return 'pdf';

  const text = (content.find((block) => block.type === 'text') || {}).text || '';
  if (text.startsWith('Texto extraído del PDF') || text.startsWith('El PDF ')) return 'pdf';
  if (text.startsWith('Contenido de la página')) return 'link';
  if (
    text.startsWith('No se pudo')
    || text.includes('no se puede procesar')
    || text.includes('No se pudo acceder')
  ) {
    return 'error';
  }
  return 'link';
}

// Envoltorio de buscarUrl con caché: si hay una copia guardada de la URL
// dentro de su tiempo de validez, la devuelve directamente sin volver a
// consultar la página. Si no, consulta de verdad y guarda el resultado para
// la próxima vez. Un fallo guardando en caché no debe romper la respuesta
// que ya se obtuvo.
async function buscarUrlConCache(agentId, url) {
  const cached = await getCachedContent(agentId, url);
  if (cached) return { content: cached, kind: inferKindFromContent(cached) };

  const result = await buscarUrl(url);
  saveToCache(url, result.content).catch((err) => console.error('Error guardando caché de página:', err));
  return result;
}

module.exports = { buscarUrlConCache };
