// Genera (o regenera) los embeddings de agent_instructions para búsqueda
// semántica. Combina concejalía + subtema + instrucción en un solo texto
// (misma construcción que se usa al indexar en el flujo de respuesta, ver
// buildInstructionText en src/services/voyageEmbeddings.js) y lo envía a
// Voyage AI (voyage-4-lite).
//
// Por defecto es idempotente: solo procesa filas activas sin embedding
// todavía, así que se puede reejecutar sin coste tras cada carga de un
// Excel nuevo. Pasa --force para regenerar también las que ya tienen
// embedding (útil si cambia el texto de una instrucción existente, o si se
// cambia de modelo de embeddings).
//
// Uso:
//   node scripts/generar_embeddings.js
//   node scripts/generar_embeddings.js --force
require('dotenv').config();
const supabase = require('../src/supabase/client');
const { buildInstructionText, embedDocuments } = require('../src/services/voyageEmbeddings');

const BATCH_SIZE = 10;
const FORCE = process.argv.includes('--force');

// Sin método de pago añadido en la cuenta de Voyage, el rate limit es de
// solo 3 peticiones/minuto (los 200M tokens gratis se aplican igual, es solo
// el rate limit el que baja). Espaciar las peticiones del backfill evita
// quemar reintentos contra ese límite; no aplica al flujo de respuesta en
// producción (una consulta suelta no necesita este espaciado).
const BATCH_INTERVAL_MS = 21000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRowsToEmbed() {
  let query = supabase
    .from('agent_instructions')
    .select('id, case_group, case_subgroup, instruction')
    .eq('active', true)
    .order('id');

  if (!FORCE) {
    query = query.is('embedding', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const rows = await fetchRowsToEmbed();

  if (rows.length === 0) {
    console.log(FORCE
      ? 'No hay filas activas en agent_instructions.'
      : 'No hay filas pendientes de embedding (usa --force para regenerar todas).');
    return;
  }

  console.log(`Generando embeddings para ${rows.length} fila(s)${FORCE ? ' (--force)' : ''}...`);

  let done = 0;
  const batches = chunk(rows, BATCH_SIZE);
  for (let b = 0; b < batches.length; b += 1) {
    if (b > 0) await sleep(BATCH_INTERVAL_MS);

    const batch = batches[b];
    const texts = batch.map(buildInstructionText);
    const embeddings = await embedDocuments(texts);

    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      const { error } = await supabase
        .from('agent_instructions')
        .update({ embedding: embeddings[i] })
        .eq('id', row.id);

      if (error) {
        console.error(`Error guardando embedding de la fila ${row.id} (${row.case_group} / ${row.case_subgroup}):`, error);
        continue;
      }
      done += 1;
    }

    console.log(`  ${done}/${rows.length}`);
  }

  console.log(`Listo. ${done}/${rows.length} filas actualizadas.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
