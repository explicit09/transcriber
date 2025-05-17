import { chunkTranscript } from '../server/chunk';
import { strict as assert } from 'assert';

const segments = [
  { start: 0, end: 1, text: 'hello world', speaker: 'A' },
  { start: 1, end: 2, text: 'this is a test segment', speaker: 'A' },
  { start: 2, end: 3, text: 'another one here', speaker: 'B' },
];

const chunks = chunkTranscript(segments);
assert.ok(chunks.length >= 1, 'produces at least one chunk');
assert.ok(chunks[0].text.includes('hello'), 'chunk contains text');

console.log('chunk tests passed');
