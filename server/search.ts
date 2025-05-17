import { db } from './db';
import { transcriptVectors } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { embedText } from './openai';
import { TranscriptSegment } from '@shared/schema';

export async function indexTranscript(
  transcriptId: number,
  segments: TranscriptSegment[]
): Promise<void> {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const embedding = await embedText(seg.text);
    await db.insert(transcriptVectors).values({
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
