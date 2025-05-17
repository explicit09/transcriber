import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkTranscript } from '../server/chunk.js';

const segments = [
  { start: 0, end: 1, text: 'hello world', speaker: 'A' },
  { start: 1, end: 2, text: 'this is a test', speaker: 'A' },
  { start: 2, end: 3, text: 'another segment here', speaker: 'B' },
];

test('chunkTranscript splits segments by token count', () => {
  const chunks = chunkTranscript(segments, 6);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, 'hello world this is a test');
  assert.equal(chunks[1].speaker, 'B');
});
