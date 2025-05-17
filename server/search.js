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
  const database = options.db ?? defaultDb;
  const embed = options.embedFn ?? defaultEmbed;
  const embedding = await embed(query);
  if (database.execute.length === 1) {
    // custom mock database
    return (await database.execute({ transcriptId, embedding, top })).rows;
  }
  const result = await database.execute(sql`
    SELECT chunk_id, speaker, ts_start, ts_end, text,
      1 - (embedding <#> ${embedding}) AS score
    FROM transcript_vectors
    WHERE transcript_id = ${transcriptId}
    ORDER BY embedding <#> ${embedding}
    LIMIT ${top}
  `);
  return result.rows;
}
