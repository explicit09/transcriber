import test from 'node:test';
import assert from 'node:assert/strict';
class MemStorage {
  constructor() {
    this.trans = new Map();
    this.comments = new Map();
    this.tid = 1;
    this.cid = 1;
  }
  async createTranscription(t) {
    const id = this.tid++;
    this.trans.set(id, { ...t, id });
    return { ...t, id };
  }
  async createComment(c) {
    const id = this.cid++;
    const arr = this.comments.get(c.transcriptId) || [];
    const comment = { ...c, id, createdAt: new Date(), updatedAt: new Date() };
    arr.push(comment);
    this.comments.set(c.transcriptId, arr);
    return comment;
  }
  async getComments(id) { return this.comments.get(id) || []; }
  async updateComment(id, up) {
    for (const [tid, list] of this.comments.entries()) {
      const idx = list.findIndex(c => c.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...up };
        this.comments.set(tid, list);
        return list[idx];
      }
    }
  }
  async deleteComment(id) {
    for (const [tid, list] of this.comments.entries()) {
      this.comments.set(tid, list.filter(c => c.id !== id));
    }
  }
}

const storage = new MemStorage();

test('comment CRUD operations', async () => {
  const t = await storage.createTranscription({
    fileName: 'a', fileSize: 1, fileType: 'mp3', status: 'done'
  });
  const c = await storage.createComment({
    transcriptId: t.id,
    yjsPos: {},
    body: 'test',
    kind: 'comment',
    status: 'open'
  });
  let list = await storage.getComments(t.id);
  assert.equal(list.length, 1);

  await storage.updateComment(c.id, { body: 'updated' });
  list = await storage.getComments(t.id);
  assert.equal(list[0].body, 'updated');

  await storage.deleteComment(c.id);
  list = await storage.getComments(t.id);
  assert.equal(list.length, 0);
});
