import test from 'node:test';
import assert from 'node:assert/strict';
import { indexTranscript, searchTranscript } from '../server/search.js';

class MockDB {
  constructor() { this.vectors = []; }
  insert() { return { values: async (v) => { this.vectors.push(v); } }; }
  async execute() {
    const { transcriptId, embedding, top } = this.lastQuery;
    const items = this.vectors.filter(v => v.transcriptId === transcriptId);
    const scored = items.map(v => ({
      chunk_id: v.chunkId,
      speaker: v.speaker,
      ts_start: v.tsStart,
      ts_end: v.tsEnd,
      text: v.text,
      score: 1 - Math.abs(v.embedding[0] - embedding[0]),
    })).sort((a,b)=>b.score-a.score).slice(0, top);
    return { rows: scored };
  }
}

const db = new MockDB();
const embed = async (t) => {
  const vec = [t.length];
  if (t === 'hi') db.lastQuery = { transcriptId: 1, embedding: vec, top: 1 };
  return vec;
};

test('searchTranscript returns best match', async () => {
  const segments = [
    { start: 0, end: 1, text: 'hello there' },
    { start: 1, end: 2, text: 'general kenobi' },
  ];
  await indexTranscript(1, segments, { db, embedFn: embed });
  db.lastQuery = { transcriptId: 1, embedding: [11], top: 1 };
  const results = await searchTranscript(1, 'hi', 1, { db, embedFn: embed });
  assert.equal(results.length, 1);
  assert.equal(results[0].chunk_id, 0);
});
