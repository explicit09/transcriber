import { db } from './db';
import { transcriptVectors } from '@shared/schema';
import { sql } from 'drizzle-orm';

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


export async function indexTranscript(
  transcriptId: number,
  segments: TranscriptSegment[]
): Promise<void> {
const chunks = chunkTranscript(segments);

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const embedding = await embedText(chunk.text);

  await db.insert(transcriptVectors).values({
    transcriptId,
    chunkId: i,
    speaker: chunk.speaker,
    text: chunk.text,
    tsStart: chunk.tsStart,
    tsEnd: chunk.tsEnd,
    tokenStart: chunk.tokenStart,
    tokenEnd: chunk.tokenEnd,
    embedding,
   });
  }
}

export async function searchTranscript(
  transcriptId: number,
  query: string,
  top: number
): Promise<{
  chunk_id: number;
  speaker: string | null;
  ts_start: number | null;
  ts_end: number | null;
  text: string | null;
  score: number;
}[]> {
  const embedding = await embedText(query);
  const result = await db.execute(sql`
    SELECT chunk_id, speaker, ts_start, ts_end, text,
      1 - (embedding <#> ${embedding}) AS score
    FROM transcript_vectors
    WHERE transcript_id = ${transcriptId}
    ORDER BY embedding <#> ${embedding}
    LIMIT ${top}
  `);
  return result.rows as any;
}
