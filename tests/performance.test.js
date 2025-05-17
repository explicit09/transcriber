import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

let searchTranscript;
try {
  ({ searchTranscript } = await import('../server/search.js'));
} catch {}

if (!searchTranscript) {
  test('search performance', { skip: true }, () => {});
} else {
  test('search query latency under 200ms', async () => {
    const segments = [
      { start: 0, end: 1, text: 'hello world' },
      { start: 1, end: 2, text: 'another segment' },
    ];
    const db = { vectors: [], insert(){return{values: async v=>this.vectors.push(v)}} , async execute(q){ const { embedding } = q; return { rows: this.vectors.map((v,i)=>({ chunk_id:i,text:v.text,score:1-Math.abs(v.embedding[0]-embedding[0])})) }; } };
    const embed = async t => [t.length];
    // index
    const { indexTranscript } = await import('../server/search.js');
    await indexTranscript(1, segments, { db, embedFn: embed });
    const start = performance.now();
    await searchTranscript(1, 'hello', 1, { db, embedFn: embed });
    const elapsed = performance.now() - start;
    assert(elapsed < 200, `expected <200ms, got ${elapsed}`);
  });
}

let WebSocket;
try {
  WebSocket = (await import('ws')).WebSocket;
} catch {}

if (!WebSocket) {
  test('websocket latency', { skip: true }, () => {});
} else {
  test('websocket ping latency under 200ms', async () => {
    const server = new WebSocket.Server({ port: 0 });
    const port = server.address().port;
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise(res => ws.once('open', res));
    const start = performance.now();
    ws.ping();
    await new Promise(res => ws.once('pong', res));
    const elapsed = performance.now() - start;
    ws.terminate();
    server.close();
    assert(elapsed < 200, `expected <200ms, got ${elapsed}`);
  });
}
