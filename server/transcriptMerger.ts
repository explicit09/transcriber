import { StructuredTranscript, TranscriptSegment } from "@shared/schema";

export interface ChunkResult {
  text: string;
  structuredTranscript: StructuredTranscript;
  duration: number;
}

export function mergeChunkTranscripts(chunks: ChunkResult[]): {
  text: string;
  structuredTranscript: StructuredTranscript;
} {
  const mergedSegments: TranscriptSegment[] = [];
  const texts: string[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    texts.push(chunk.text);
    const segs = chunk.structuredTranscript?.segments || [];
    for (const seg of segs) {
      mergedSegments.push({
        ...seg,
        start: seg.start + offset,
        end: seg.end + offset,
      });
    }
    offset += chunk.duration;
  }

  const normalized: TranscriptSegment[] = mergedSegments.reduce(
    (acc: TranscriptSegment[], curr) => {
      if (acc.length === 0) return [curr];
      const last = acc[acc.length - 1];
      if (last.speaker === curr.speaker && curr.start <= last.end + 0.5) {
        last.end = Math.max(last.end, curr.end);
        last.text = `${last.text} ${curr.text}`.trim();
        return acc;
      }
      acc.push({ ...curr });
      return acc;
    },
    []
  );

  const speakers = new Set<string>();
  normalized.forEach((s) => {
    if (s.speaker) speakers.add(s.speaker);
  });

  return {
    text: texts.join(" "),
    structuredTranscript: {
      segments: normalized,
      metadata: {
        speakerCount: speakers.size || undefined,
        duration: offset,
      },
    },
  };
}
