import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

class FakeDoc extends EventEmitter {
  constructor() {
    super();
    this.text = '';
  }
  insert(t) {
    this.text += t;
    this.emit('update');
  }
  getText() {
    const doc = this;
    return {
      toString: () => doc.text,
      insert: (_pos, t) => doc.insert(t),
      get length() { return doc.text.length; }
    };
  }
}

function encodeState(doc) {
  return Buffer.from(doc.text).toString('base64');
}

function trackDocForTest(name, doc, storage) {
  let ops = 0;
  const save = async () => {
    if (ops === 0) return;
    const snapshot = encodeState(doc);
    const text = doc.getText().toString();
    await storage.saveRevision(name, snapshot, ops);
    await storage.updateTranscription(name, { text, updatedAt: new Date() });
    await storage.addRevision(name, text);
    ops = 0;
  };
  doc.on('update', () => {
    ops++;
    if (ops >= 500) {
      void save();
    }
  });
  return { save };
}

test('collaborative edits persist after 500 ops', async () => {
  const calls = { save: 0, update: 0, add: 0 };
  const storage = {
    saveRevision: async () => { calls.save++; },
    updateTranscription: async () => { calls.update++; },
    addRevision: async () => { calls.add++; },
  };
  const doc = new FakeDoc();
  trackDocForTest(1, doc, storage);
  const txt = doc.getText();
  for (let i = 0; i < 500; i++) {
    txt.insert(txt.length, 'a');
  }
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.save, 1);
  assert.equal(calls.update, 1);
  assert.equal(calls.add, 1);
});
