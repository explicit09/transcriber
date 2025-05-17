import { TranscriptSegment } from '@shared/schema';

export interface Chunk {
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

// Chunk transcript segments into ~200-token chunks with 3s overlap
export function chunkTranscript(segments: TranscriptSegment[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;
  let tokenCount = 0;

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
    }
    current = null;
    tokenCount = 0;
  };

  for (const seg of segments) {
    const words = seg.text.split(/\s+/);
    const segTokens = words.length;
    if (!current) {
      current = { text: seg.text, start: seg.start, end: seg.end, speaker: seg.speaker };
      tokenCount = segTokens;
    } else if (tokenCount + segTokens > 200) {
      // close current chunk and start a new one with overlap
      current.end = seg.end;
      pushCurrent();
      // start new chunk with overlap of 3 seconds
      const overlapStart = Math.max(seg.start - 3, current ? current.end : seg.start);
      current = { text: seg.text, start: overlapStart, end: seg.end, speaker: seg.speaker };
      tokenCount = segTokens;
    } else {
      current.text += ' ' + seg.text;
      current.end = seg.end;
      tokenCount += segTokens;
    }
  }
  if (current) pushCurrent();
  return chunks;
}
