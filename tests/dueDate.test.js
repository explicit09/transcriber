import test from 'node:test';
import assert from 'node:assert/strict';

let parseDueDate;
try {
  parseDueDate = (await import('../server/openai.js')).parseDueDate;
} catch {
  parseDueDate = null;
}

test('parseDueDate returns ISO for valid date', { skip: !parseDueDate }, async () => {
  const iso = await parseDueDate('2025-05-01');
  assert.ok(typeof iso === 'string' && iso.startsWith('2025-05-01'));
});

test('parseDueDate returns null for invalid date', { skip: !parseDueDate }, async () => {
  const iso = await parseDueDate('not a date');
  assert.equal(iso, null);
});
