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
let chunkTranscript;
try {
  ({ chunkTranscript } = await import('./chunk.js'));
} catch {}

let storage;
try {
  ({ storage } = await import('./storage.js'));
} catch {}

class LruCache {
  constructor(max = 100, ttl = 5 * 60 * 1000) {
    this.max = max;
    this.ttl = ttl;
    this.store = new Map();
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > this.ttl) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }
  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
  }
  clear() {
    this.store.clear();
  }
}

const cache = new LruCache();

const reindexTimers = new Map();

async function reindexTranscript(id) {
  if (!storage) return;
  const t = await storage.getTranscription(id);
  if (!t || !t.structuredTranscript) return;
  const data = JSON.parse(t.structuredTranscript);
  if (!Array.isArray(data.segments)) return;
  const newChunks = chunkTranscript ? chunkTranscript(data.segments) : data.segments.map((s, i) => ({ chunkId:i, text:s.text, speaker:s.speaker??null, tsStart:s.start, tsEnd:s.end, tokenStart:0, tokenEnd:s.text.split(/\s+/).length }));
  const existing = defaultDb.execute ? (await defaultDb.execute(sql`SELECT * FROM transcript_vectors WHERE transcript_id = ${id}`)).rows : [];
  const byId = new Map();
  for (const row of existing) byId.set(row.chunk_id, row);
  const seen = new Set();
  for (const chunk of newChunks) {
    const row = byId.get(chunk.chunkId);
    if (row && row.text === chunk.text && row.speaker === chunk.speaker && Number(row.ts_start) === chunk.tsStart && Number(row.ts_end) === chunk.tsEnd) {
      seen.add(row.id);
      continue;
    }
    const embedding = await defaultEmbed(chunk.text);
    if (row) {
      await defaultDb.execute(sql`UPDATE transcript_vectors SET speaker=${chunk.speaker}, text=${chunk.text}, ts_start=${chunk.tsStart}, ts_end=${chunk.tsEnd}, token_start=${chunk.tokenStart}, token_end=${chunk.tokenEnd}, embedding=${embedding} WHERE id=${row.id}`);
      seen.add(row.id);
    } else {
      await defaultDb.insert(transcriptVectors).values({ transcriptId:id, chunkId: chunk.chunkId, speaker:chunk.speaker, text:chunk.text, tsStart:chunk.tsStart, tsEnd:chunk.tsEnd, tokenStart:chunk.tokenStart, tokenEnd:chunk.tokenEnd, embedding });
    }
  }
  for (const row of existing) {
    if (!seen.has(row.id)) await defaultDb.execute(sql`DELETE FROM transcript_vectors WHERE id=${row.id}`);
  }
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
  if (!bypassCache) {
    const c = cache.get(key);
    if (c) return c.result;
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
export async function searchTranscriptWithFacets(transcriptId, query, top, filters = {}, options = {}) {
  const base = await searchTranscript(transcriptId, query, top * 10, { ...options, tags: filters.tags ?? [], bypassCache: true });
  let rows = base;
  if (filters.speakers && filters.speakers.length) {
    rows = rows.filter(r => r.speaker && filters.speakers.includes(r.speaker));
  }
  if (typeof filters.start === 'number') {
    rows = rows.filter(r => r.ts_start == null || r.ts_start >= filters.start);
  }
  if (typeof filters.end === 'number') {
    rows = rows.filter(r => r.ts_end == null || r.ts_end <= filters.end);
  }
  const tagFacets = {};
  const speakerFacets = {};
  for (const r of rows) {
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) tagFacets[t] = (tagFacets[t] || 0) + 1;
    }
    if (r.speaker) speakerFacets[r.speaker] = (speakerFacets[r.speaker] || 0) + 1;
  }
  const results = rows.slice(0, top);
  return { results, facets: { tags: tagFacets, speakers: speakerFacets } };
}
