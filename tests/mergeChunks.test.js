import { strict as assert } from 'assert';
import { mergeChunkTranscripts } from '../server/transcriptMerger.js';

const chunk1 = {
  text: 'hello world',
  structuredTranscript: {
    segments: [{ start: 0, end: 1, text: 'hello', speaker: 'A' }],
    metadata: { speakerCount: 1, duration: 1 }
  },
  duration: 1
};

const chunk2 = {
  text: 'foo bar',
  structuredTranscript: {
    segments: [{ start: 0, end: 1, text: 'bar', speaker: 'B' }],
    metadata: { speakerCount: 1, duration: 1 }
  },
  duration: 1
};

const merged = mergeChunkTranscripts([chunk1, chunk2]);
assert.equal(merged.structuredTranscript.segments.length, 2);
assert.equal(merged.structuredTranscript.segments[1].start, 1);
console.log('merge chunks tests passed');
