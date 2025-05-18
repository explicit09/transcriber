import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDueDate } from '../server/openai.js';

test('parseDueDate returns ISO for valid date', async () => {
  const iso = await parseDueDate('2025-05-01');
  assert.ok(typeof iso === 'string' && iso.startsWith('2025-05-01'));
});

test('parseDueDate returns null for invalid date', async () => {
  const iso = await parseDueDate('not a date');
  assert.equal(iso, null);
});
