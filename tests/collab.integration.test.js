import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verify(token, secret) {
  const [header, body, sig] = token.split('.');
  const data = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (expected !== sig) throw new Error('invalid signature');
  return JSON.parse(Buffer.from(body, 'base64url').toString());
}

const secret = 'secret';

test('collaboration token verification', () => {
  const token = sign({ transcriptionId: 1, scopes: ['read'] }, secret);
  const decoded = verify(token, secret);
  assert.equal(decoded.transcriptionId, 1);
});
