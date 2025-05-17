import { db } from './db';
import { transcriptVectors } from '@shared/schema';
import { eq } from 'drizzle-orm';
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

