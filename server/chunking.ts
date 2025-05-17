import { TranscriptSegment } from '@/shared/schema';

export interface TranscriptChunk {
  text: string;
  speaker: string | null;
  tsStart: number;
  tsEnd: number;
  tokenStart: number;
  tokenEnd: number;
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  tokensPerChunk = 200,
  overlap = 40
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: TranscriptChunk | null = null;
  let globalToken = 0;

  const finalize = () => {
    if (current) {
      current.tokenEnd = globalToken;
      chunks.push(current);
      current = null;
    }
  };

  for (const seg of segments) {
    const words = seg.text.split(/\s+/);
    let idx = 0;
    while (idx < words.length) {
      if (!current) {
        current = {
          text: '',
          speaker: seg.speaker ?? null,
          tsStart: seg.start,
          tsEnd: seg.end,
          tokenStart: globalToken,
          tokenEnd: 0,
        };
      }
      const remaining = words.length - idx;
      const capacity = tokensPerChunk - current.text.split(/\s+/).filter(Boolean).length;
      const take = Math.min(remaining, capacity);
      const slice = words.slice(idx, idx + take).join(' ');
      current.text += (current.text ? ' ' : '') + slice;
      idx += take;
      globalToken += take;
      current.tsEnd = seg.end;

      if (current.text.split(/\s+/).length >= tokensPerChunk) {
        finalize();
        if (overlap > 0) {
          const overlapWords = words.slice(idx - overlap, idx).join(' ');
          current = {
            text: overlapWords,
            speaker: seg.speaker ?? null,
            tsStart: seg.start,
            tsEnd: seg.end,
            tokenStart: globalToken - overlap,
            tokenEnd: 0,
          };
        }
      }
    }
  }

  finalize();
  return chunks;
}
