import { db } from './db';
import { transcriptVectors } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { tagText } from './openai';

export async function tagTranscriptVectors(
  transcriptId: number,
  options: { db?: any; tagFn?: (text: string) => Promise<string[]> } = {}
) {
  const database = options.db ?? db;
  const tagFn = options.tagFn ?? tagText;

  const rows = await database
    .select()
    .from(transcriptVectors)
    .where(eq(transcriptVectors.transcriptId, transcriptId));

  for (const row of rows) {
    const tags = await tagFn(row.text ?? '');
    await database
      .update(transcriptVectors)
      .set({ tags })
      .where(eq(transcriptVectors.id, row.id));
  }
}

export async function tagPendingChunks(
  options: {
    db?: any;
    tagFn?: (text: string) => Promise<string[]>;
    batchSize?: number;
  } = {}
) {
  const database = options.db ?? db;
  const tagFn = options.tagFn ?? tagText;
  const batchSize = options.batchSize ?? 10;

  const { rows } = await database.execute(sql`
    SELECT id, text
    FROM transcript_vectors
    WHERE tags IS NULL OR array_length(tags, 1) = 0
    ORDER BY id
    LIMIT ${batchSize}
  `);

  for (const row of rows as any[]) {
    const tags = await tagFn(row.text ?? "");
    await database
      .update(transcriptVectors)
      .set({ tags })
      .where(eq(transcriptVectors.id, row.id));
  }
}

export function startTaggingJob(intervalMs = 30000) {
  const timer = setInterval(() => {
    tagPendingChunks().catch((err) => console.error("tagging job failed", err));
  }, intervalMs);
  return () => clearInterval(timer);
}

