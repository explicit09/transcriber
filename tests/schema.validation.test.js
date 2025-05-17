import test from 'node:test';
import assert from 'node:assert/strict';

let insertCommentSchema;
try {
  ({ insertCommentSchema } = await import('../shared/schema.js'));
} catch (err) {
  // Schema not available when dependencies are missing
}

test('insertCommentSchema requires createdBy field', { skip: !insertCommentSchema }, () => {
  assert.throws(() => insertCommentSchema.parse({ body: 'x', kind: 'comment', status: 'open', transcriptId: 1, yjsPos: {} }), /created/i);
});
