// Utility for splitting transcript segments into chunks.
// Types are documented with JSDoc for clarity.
/**
 * @typedef {{start:number,end:number,text:string,speaker?:string}} TranscriptSegment
 * @typedef {{id:number,text:string,start:number,end:number,speaker?:string}} TranscriptChunk
 */

/**
 * Split transcript segments into chunks based on a maximum number of tokens.
 * Tokens are approximated by whitespace separated words.
 * @param {TranscriptSegment[]} segments
 * @param {number} [maxTokens=200]
 * @returns {TranscriptChunk[]}
 */
export function chunkTranscript(segments, maxTokens = 200) {
  const chunks = [];
  let current = null;
  let tokenCount = 0;

  function flush() {
    if (!current) return;
    chunks.push({ id: chunks.length, ...current });
    current = null;
    tokenCount = 0;
  }

  for (const seg of segments) {
    const segTokens = seg.text.trim().split(/\s+/).length;
    if (!current) {
      current = {
        text: seg.text,
        start: seg.start,
        end: seg.end,
        speaker: seg.speaker,
      };
      tokenCount = segTokens;
      continue;
    }
    if (tokenCount + segTokens > maxTokens) {
      flush();
      current = {
        text: seg.text,
        start: seg.start,
        end: seg.end,
        speaker: seg.speaker,
      };
      tokenCount = segTokens;
    } else {
      current.text += ' ' + seg.text;
      current.end = seg.end;
      tokenCount += segTokens;
      if (!current.speaker) current.speaker = seg.speaker;
    }
  }
  flush();
  return chunks;
}
