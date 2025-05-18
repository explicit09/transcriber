import { strict as assert } from 'assert';
import { structuredTranscriptToSRT } from '../server/srt.js';

const transcript = {
  segments: [
    { start: 0, end: 1.2, text: 'hello world', speaker: 'A' },
    { start: 1.2, end: 2.5, text: 'another line', speaker: 'B' }
  ]
};

const srt = structuredTranscriptToSRT(transcript);
assert.ok(srt.includes('00:00:00,000 --> 00:00:01,200'));
assert.ok(srt.includes('hello world'));
console.log('srt tests passed');
