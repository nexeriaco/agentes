function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

function summarizeInstruction(instr) {
  if (!instr) return null;
  return {
    tabla: 'agent_instructions',
    id: instr.id,
    case_group: instr.case_group,
    case_subgroup: instr.case_subgroup,
    response_mode: instr.response_mode || null,
    similarity: instr.similarity != null ? Number(instr.similarity.toFixed(4)) : null,
  };
}

function summarizeEvent(event) {
  if (!event) return null;
  return {
    tabla: 'agent_events',
    id: event.id,
    title: event.title,
  };
}

function summarizeCandidates(instructions) {
  return instructions.map(summarizeInstruction);
}

function formatFuenteLine(fuente) {
  if (!fuente) return 'ninguna';
  if (fuente.tabla === 'agent_events') {
    return `agent_events | ${fuente.title || '(sin título)'} | id=${fuente.id}`;
  }
  const sim = fuente.similarity != null ? ` | sim=${fuente.similarity}` : '';
  const mode = fuente.response_mode ? ` | mode=${fuente.response_mode}` : '';
  return `agent_instructions | ${fuente.case_group || '?'} › ${fuente.case_subgroup || '?'} | id=${fuente.id}${sim}${mode}`;
}

function formatCandidatasLines(candidatas) {
  if (!candidatas || candidatas.length === 0) return ['  (ninguna)'];
  return candidatas.map((c, i) => {
    const sim = c.similarity != null ? c.similarity.toFixed(4) : '—.———';
    return `  ${i + 1}. [${sim}] ${c.case_group || '?'} › ${c.case_subgroup || '?'} | id=${c.id}`;
  });
}

function oneLine(text) {
  if (text == null) return '(vacío)';
  return String(text).replace(/\s+/g, ' ').trim();
}

// Lecturas de URL: prefetch desde tabla page_cache → "page_cache";
// buscar_url en vivo → pdf|link|error. Vacío → nada (no confundir con historial).
function formatUrlReadsLine(urlReads) {
  if (!urlReads || urlReads.length === 0) return 'nada';
  return urlReads
    .map((r) => {
      const kind = r.kind === 'cache' ? 'page_cache' : (r.kind || 'link');
      return `${kind} | ${r.url}`;
    })
    .join('  ;  ');
}

// Mensajes previos inyectados desde conversation_history (no es page_cache).
function formatHistorialLine(historialMsgs) {
  if (historialMsgs == null) return null;
  const n = Number(historialMsgs) || 0;
  if (n <= 0) return 'vacío (sin conversation_history)';
  return `${n} msgs | conversation_history`;
}

// Un id corto por consulta. Railway parte los \n en eventos distintos; si hay
// varias consultas en paralelo las líneas se entremezclan en la UI. Prefijar
// cada línea con el mismo id permite agrupar/filtrar aunque lleguen mezcladas.
function newConsultaLogId() {
  return Math.random().toString(36).slice(2, 8);
}

// Orden de campos (estable): barra → cabecera modo/fecha → Consulta →
// Respuesta → Fuente → Lectura (page_cache/pdf) → Historial (conversation_history)
// → (Fuente raw) → (Motivo) → Candidatas → Tokens → Coste → barra.
function logConsulta(payload) {
  const bar = '='.repeat(72);
  const thin = '-'.repeat(72);
  const tokens = payload.tokens || emptyUsage();
  const logId = newConsultaLogId();
  const tag = `[${logId}]`;
  const lines = [
    bar,
    `[consulta]  modo=${payload.modo}  |  ${payload.fecha}  |  id=${logId}`,
    thin,
    `Consulta:   ${oneLine(payload.consulta)}`,
    `Respuesta:  ${oneLine(payload.respuesta)}`,
    thin,
    `Fuente:     ${formatFuenteLine(payload.fuente)}`,
    `Lectura:    ${formatUrlReadsLine(payload.url_reads)}`,
  ];

  const historialLine = formatHistorialLine(payload.historial_msgs);
  if (historialLine) {
    lines.push(`Historial:  ${historialLine}`);
  }

  if (payload.fuente_raw != null) {
    lines.push(`Fuente raw: ${payload.fuente_raw}`);
  }
  if (payload.motivo) {
    lines.push(`Motivo:     ${payload.motivo}`);
  }

  lines.push('Candidatas:');
  lines.push(...formatCandidatasLines(payload.candidatas));
  lines.push(thin);
  lines.push(
    `Tokens:     in=${tokens.input_tokens || 0}  out=${tokens.output_tokens || 0}`
      + `  cache_w=${tokens.cache_creation_input_tokens || 0}`
      + `  cache_r=${tokens.cache_read_input_tokens || 0}`
  );
  lines.push(
    `Coste:      $${payload.coste_usd ?? 0}`
      + `  |  modelo=${payload.modelo || '—'}`
      + (payload.tool_calls != null ? `  |  tools=${payload.tool_calls}` : '')
  );
  lines.push(bar);

  // Una sola escritura atómica; cada línea lleva el id por si el viewer parte el bloque.
  process.stdout.write(`${lines.map((line) => `${tag} ${line}`).join('\n')}\n`);
}

module.exports = {
  emptyUsage,
  summarizeInstruction,
  summarizeEvent,
  summarizeCandidates,
  logConsulta,
};
