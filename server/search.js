let defaultDb;
try {
  ({ db: defaultDb } = await import('./db.js'));
} catch {}
let transcriptVectors;
try {
  ({ transcriptVectors } = await import('../shared/schema.js'));
} catch {}
let sql;
try {
  ({ sql } = await import('drizzle-orm'));
} catch {
  sql = () => ({})
}
let defaultEmbed;
try {
  ({ embedText: defaultEmbed } = await import('./openai.js'));
} catch {}

let storage;
try {
  ({ storage } = await import('./storage.js'));
} catch {}

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const reindexTimers = new Map();

async function reindexTranscript(id) {
  if (!storage) return;
  const t = await storage.getTranscription(id);
  if (!t || !t.structuredTranscript) return;
  const data = JSON.parse(t.structuredTranscript);
  if (!Array.isArray(data.segments)) return;
  if (defaultDb.execute) {
    await defaultDb.execute(sql`DELETE FROM transcript_vectors WHERE transcript_id = ${id}`);
  }
  await indexTranscript(id, data.segments);
}

export function scheduleReindex(id, delay = 30000) {
  if (reindexTimers.has(id)) clearTimeout(reindexTimers.get(id));
  reindexTimers.set(
    id,
    setTimeout(() => {
      reindexTimers.delete(id);
      reindexTranscript(id).catch(console.error);
    }, delay)
  );
}

export async function ensureVectorIndex(database = defaultDb) {
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS transcript_vectors_embedding_hnsw
      ON transcript_vectors
      USING hnsw (embedding vector_l2_ops)
      WITH (m = 16, ef_construction = 128);
  `);
}

/**
 * Index transcript segments for semantic search.
 * @param {number} transcriptId
 * @param {Array} segments
 * @param {{db?: any, embedFn?: (text:string)=>Promise<number[]>}} [options]
 */
export async function indexTranscript(transcriptId, segments, options = {}) {
  const database = options.db ?? defaultDb;
  const embed = options.embedFn ?? defaultEmbed;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const embedding = await embed(seg.text);
    await database.insert(transcriptVectors).values({
      transcriptId,
      chunkId: i,
      speaker: seg.speaker ?? null,
      text: seg.text,
      tsStart: seg.start,
      tsEnd: seg.end,
      tokenStart: 0,
      tokenEnd: seg.text.split(/\s+/).length,
      embedding,
      tags: seg.tags ?? null,
    });
  }
}

/**
 * Search transcript chunks by embedding similarity.
 * @param {number} transcriptId
 * @param {string} query
 * @param {number} top
 * @param {{db?: any, embedFn?: (text:string)=>Promise<number[]>}} [options]
 */
export async function searchTranscript(transcriptId, query, top, options = {}) {
  const { db: database = defaultDb, embedFn: embed = defaultEmbed, tags = [], bypassCache = false } = options;
  const key = `${transcriptId}:${query}:${tags.sort().join(',')}`;
  if (!bypassCache && cache.has(key)) {
    const c = cache.get(key);
    if (Date.now() - c.ts < CACHE_TTL) return c.result;
  }
  const embedding = await embed(query);
  if (database.execute.length === 1) {
    const res = (await database.execute({ transcriptId, embedding, top, tags })).rows;
    cache.set(key, { ts: Date.now(), result: res });
    return res;
  }
  const limit = tags.length > 0 ? top * 10 : top;
  const result = await database.execute(sql`
    SELECT chunk_id, speaker, ts_start, ts_end, text, tags,
      1 - (embedding <#> ${embedding}) AS score
    FROM transcript_vectors
    WHERE transcript_id = ${transcriptId}
    ORDER BY embedding <#> ${embedding}
    LIMIT ${limit}
  `);
  let rows = result.rows;
  if (tags.length > 0) {
    rows = rows.filter(r => Array.isArray(r.tags) && r.tags.some(t => tags.includes(t))).slice(0, top);
  }
  cache.set(key, { ts: Date.now(), result: rows });
  return rows;
}
