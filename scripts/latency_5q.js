/**
 * Prueba de latencia end-to-end con 5 preguntas distintas.
 * Uso (staging):
 *   railway run --project ... --environment ... --service ... node scripts/latency_5q.js
 */
require('dotenv').config();

const QUESTIONS = [
  'horario del ayuntamiento',
  'farmacia de guardia el dia de hoy',
  'quien es el responsable de juventud',
  'horario de ecoparque',
  'Según la norma de teletrabajo, ¿cuántos días de teletrabajo tengo en Semana Santa 2027?',
];

const AGENT_ID = 'c1330a20-c057-4764-8121-6268ca02f280';
const CHAT_ID = `latency-probe-${Date.now()}`;

function patchTimers() {
  const timings = [];
  const push = (name, ms, extra = {}) => timings.push({ name, ms, ...extra });

  // Voyage
  const voyage = require('../src/services/voyageEmbeddings');
  const origEmbed = voyage.embedQuery;
  const origEmbeds = voyage.embedQueries;
  voyage.embedQuery = async (text) => {
    const t0 = Date.now();
    try {
      return await origEmbed(text);
    } finally {
      push('voyage_embedQuery', Date.now() - t0);
    }
  };
  voyage.embedQueries = async (texts) => {
    const t0 = Date.now();
    try {
      return await origEmbeds(texts);
    } finally {
      push('voyage_embedQueries', Date.now() - t0, { n: texts.length });
    }
  };

  // Anthropic
  const anthropic = require('../src/anthropic/client');
  const origCreate = anthropic.messages.create.bind(anthropic.messages);
  let claudeCall = 0;
  anthropic.messages.create = async (params) => {
    const t0 = Date.now();
    claudeCall += 1;
    const n = claudeCall;
    try {
      const res = await origCreate(params);
      push('claude', Date.now() - t0, {
        call: n,
        in: res.usage?.input_tokens,
        out: res.usage?.output_tokens,
        cache_r: res.usage?.cache_read_input_tokens || 0,
        cache_w: res.usage?.cache_creation_input_tokens || 0,
      });
      return res;
    } catch (e) {
      push('claude', Date.now() - t0, { call: n, error: true });
      throw e;
    }
  };

  // URL tool (vía cache)
  const urlCache = require('../src/services/urlCache');
  const origUrl = urlCache.buscarUrlConCache;
  urlCache.buscarUrlConCache = async (...args) => {
    const t0 = Date.now();
    try {
      const r = await origUrl(...args);
      push('buscar_url', Date.now() - t0, { kind: r?.kind });
      return r;
    } catch (e) {
      push('buscar_url', Date.now() - t0, { error: true });
      throw e;
    }
  };

  return {
    reset() {
      timings.length = 0;
      claudeCall = 0;
    },
    snapshot() {
      return timings.slice();
    },
  };
}

function summarizePhases(phases) {
  const by = {};
  for (const p of phases) {
    by[p.name] = (by[p.name] || 0) + p.ms;
  }
  return by;
}

(async () => {
  const timers = patchTimers();
  // Requerir generateAnswer DESPUÉS de los patches (mismo require cache)
  const { generateAnswer } = require('../src/services/answer');

  const results = [];

  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const q = QUESTIONS[i];
    timers.reset();
    const t0 = Date.now();
    let answer = '';
    let err = null;
    try {
      const r = await generateAnswer(q, AGENT_ID, `${CHAT_ID}-${i}`);
      answer = (r && r.answer) || '';
    } catch (e) {
      err = String(e.message || e).slice(0, 200);
    }
    const totalMs = Date.now() - t0;
    const phases = timers.snapshot();
    const sums = summarizePhases(phases);

    const row = {
      n: i + 1,
      pregunta: q,
      total_ms: totalMs,
      total_s: Number((totalMs / 1000).toFixed(2)),
      fases_ms: sums,
      detalle: phases,
      respuesta_preview: answer.slice(0, 140).replace(/\s+/g, ' '),
      error: err,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }

  console.log('\n===== RESUMEN =====');
  for (const r of results) {
    const f = r.fases_ms;
    console.log(
      `#${r.n} ${r.total_s}s | voyage=${(f.voyage_embedQuery || 0) + (f.voyage_embedQueries || 0)}ms`
        + ` claude=${f.claude || 0}ms url=${f.buscar_url || 0}ms`
        + ` | ${r.pregunta.slice(0, 60)}…`
    );
  }
  const totals = results.map((r) => r.total_ms);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  console.log(JSON.stringify({
    avg_s: Number((avg / 1000).toFixed(2)),
    min_s: Number((Math.min(...totals) / 1000).toFixed(2)),
    max_s: Number((Math.max(...totals) / 1000).toFixed(2)),
  }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
