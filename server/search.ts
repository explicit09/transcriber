import { db } from './db';
import { transcriptVectors, transcriptions } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { storage } from './storage';

export async function ensureVectorIndex() {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS transcript_vectors_embedding_hnsw
      ON transcript_vectors
      USING hnsw (embedding vector_l2_ops)
      WITH (m = 16, ef_construction = 128);
  `);
}
import { embedText } from './openai';
import { TranscriptSegment } from '@shared/schema';
import { chunkTranscriptSegments } from './chunker';

import { chunkTranscript } from './chunking';

// ---- simple in-memory cache for search results ----
interface CacheEntry {
  ts: number;
  result: any;
}
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

export function clearSearchCache() {
  cache.clear();
}

// ---- incremental reindex scheduling ----
const reindexTimers = new Map<number, NodeJS.Timeout>();

async function reindexTranscript(id: number) {
  const t = await storage.getTranscription(id);
  if (!t || !t.structuredTranscript) return;
  const data = JSON.parse(t.structuredTranscript);
  if (!Array.isArray(data.segments)) return;
  await db.delete(transcriptVectors).where(eq(transcriptVectors.transcriptId, id));
  await indexTranscript(id, data.segments);
}

export function scheduleReindex(id: number, delay = 30000) {
  if (reindexTimers.has(id)) {
    clearTimeout(reindexTimers.get(id)!);
  }
  reindexTimers.set(
    id,
    setTimeout(() => {
      reindexTimers.delete(id);
      reindexTranscript(id).catch(console.error);
    }, delay)
  );
}
export async function indexTranscript(
  transcriptId: number,
  segments: (TranscriptSegment & { tags?: string[] })[],
  options: { db?: any; embedFn?: (text: string) => Promise<number[]> } = {}
): Promise<void> {
  const database = options.db ?? db;
  const embedFn = options.embedFn ?? embedText;
  const chunks = chunkTranscript(segments);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await embedFn(chunk.text);
    await database.insert(transcriptVectors).values({
      transcriptId,
      chunkId: i,
      speaker: chunk.speaker,
      text: chunk.text,
      tsStart: chunk.tsStart,
      tsEnd: chunk.tsEnd,
      tokenStart: chunk.tokenStart,
      tokenEnd: chunk.tokenEnd,
      embedding,
      tags: (segments[i] as any).tags ?? null,
    });
  }
}

export async function searchTranscript(
  transcriptId: number,
  query: string,
  top: number,
  tags: string[] = [],
  options: {
    db?: any;
    embedFn?: (text: string) => Promise<number[]>;
    bypassCache?: boolean;
    speaker?: string;
    start?: number;
    end?: number;
  } = {}
): Promise<{ results: any[]; facets: { speakers: Record<string, number>; tags: Record<string, number> } }> {
  const cacheKey = `${transcriptId}:${query}:${tags.sort().join(',')}:${options.speaker ?? ''}:${options.start ?? ''}:${options.end ?? ''}`;
  if (!options.bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.result;
    }
  }

  const database = options.db ?? db;
  const embedFn = options.embedFn ?? embedText;

  const embedding = await embedFn(query);
  const limit = tags.length > 0 || options.speaker ? top * 10 : top;
  const result = await database.execute(sql`
    SELECT chunk_id, speaker, ts_start, ts_end, text, tags,
      1 - (embedding <#> ${embedding}) AS score
    FROM transcript_vectors
    WHERE transcript_id = ${transcriptId}
      ${options.speaker ? sql`AND speaker = ${options.speaker}` : sql``}
      ${options.start !== undefined ? sql`AND ts_start >= ${options.start}` : sql``}
      ${options.end !== undefined ? sql`AND ts_end <= ${options.end}` : sql``}
    ORDER BY embedding <#> ${embedding}
    LIMIT ${limit}
  `);
  let rows = result.rows as any[];
  if (tags.length > 0) {
    rows = rows.filter(r => Array.isArray(r.tags) && r.tags.some((t: string) => tags.includes(t)));
  }
  const facets = { speakers: {} as Record<string, number>, tags: {} as Record<string, number> };
  for (const r of rows) {
    if (r.speaker) facets.speakers[r.speaker] = (facets.speakers[r.speaker] || 0) + 1;
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) {
        facets.tags[t] = (facets.tags[t] || 0) + 1;
      }
    }
  }
  rows = rows.slice(0, top);

  const resultPayload = { results: rows as any[], facets };
  cache.set(cacheKey, { ts: Date.now(), result: resultPayload });
  return resultPayload;
}
export async function searchTranscriptWithFacets(
  transcriptId: number,
  query: string,
  top: number,
  filters: { tags?: string[]; speakers?: string[]; start?: number; end?: number } = {},
  options: { db?: any; embedFn?: (text: string) => Promise<number[]>; bypassCache?: boolean } = {}
): Promise<{ results: Awaited<ReturnType<typeof searchTranscript>>; facets: { tags: Record<string, number>; speakers: Record<string, number> } }> {
  const base = await searchTranscript(transcriptId, query, top * 10, filters.tags ?? [], { ...options, bypassCache: true });
  let rows: any[] = base;
  if (filters.speakers && filters.speakers.length > 0) {
    rows = rows.filter(r => r.speaker && filters.speakers!.includes(r.speaker));
  }
  if (typeof filters.start === 'number') {
    rows = rows.filter(r => r.ts_start === null || r.ts_start >= filters.start!);
  }
  if (typeof filters.end === 'number') {
    rows = rows.filter(r => r.ts_end === null || r.ts_end <= filters.end!);
  }

  const tagFacets: Record<string, number> = {};
  const speakerFacets: Record<string, number> = {};
  for (const r of rows) {
    if (Array.isArray(r.tags)) {
      for (const t of r.tags) tagFacets[t] = (tagFacets[t] || 0) + 1;
    }
    if (r.speaker) speakerFacets[r.speaker] = (speakerFacets[r.speaker] || 0) + 1;
  }

  const results = rows.slice(0, top);
  return { results, facets: { tags: tagFacets, speakers: speakerFacets } };
}
