import { TranscriptSegment } from '@shared/schema';

export interface TranscriptChunk {
  chunkId: number;
  text: string;
  tokenStart: number;
  tokenEnd: number;
  tsStart: number;
  tsEnd: number;
  speaker?: string | null;
}

/**
 * Split transcript segments into roughly `tokensPerChunk`-sized chunks with `overlap` tokens
 * overlapping between consecutive chunks.
 */
export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  tokensPerChunk = 200,
  overlap = 50
): TranscriptChunk[] {
  const tokens: { word: string; start: number; end: number; speaker?: string }[] = [];

  // Flatten segments into individual tokens so we can create windows across segment boundaries
  for (const seg of segments) {
    const segTokens = seg.text.trim().split(/\s+/).filter(Boolean);
    for (const word of segTokens) {
      tokens.push({ word, start: seg.start, end: seg.end, speaker: seg.speaker });
    }
  }

  if (tokens.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  const step = Math.max(1, tokensPerChunk - overlap);
  let chunkId = 0;

  for (let i = 0; i < tokens.length; i += step) {
    const endIdx = Math.min(i + tokensPerChunk, tokens.length);
    const chunkTokens = tokens.slice(i, endIdx);
    if (chunkTokens.length === 0) break;

    const text = chunkTokens.map((t) => t.word).join(' ');
    const speakers = new Set(chunkTokens.map((t) => t.speaker).filter(Boolean));
    const speaker = speakers.size === 1 ? chunkTokens[0].speaker ?? null : null;

    chunks.push({
      chunkId: chunkId++,
      text,
      tokenStart: i,
      tokenEnd: endIdx,
      tsStart: chunkTokens[0].start,
      tsEnd: chunkTokens[chunkTokens.length - 1].end,
      speaker,
    });

    if (endIdx === tokens.length) break;
  }

  return chunks;
}
