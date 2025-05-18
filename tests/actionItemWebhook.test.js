import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
async function sendActionItemWebhook(data) {
  const urls = [];
  if (process.env.CLICKUP_WEBHOOK_URL) urls.push(process.env.CLICKUP_WEBHOOK_URL);
  if (process.env.NOTION_WEBHOOK_URL) urls.push(process.env.NOTION_WEBHOOK_URL);
  if (process.env.ACTION_ITEM_WEBHOOK_URLS) {
    urls.push(...process.env.ACTION_ITEM_WEBHOOK_URLS.split(',').map(u => u.trim()).filter(Boolean));
  }
  for (const url of urls) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (_) {
      /* ignore */
    }
  }
}

function startServer(onRequest) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => { onRequest(req, body); res.end('ok'); });
    });
    server.listen(0, () => resolve(server));
  });
}

test('sendActionItemWebhook posts to configured URLs', async () => {
  const received = [];
  const server = await startServer((req, body) => {
    received.push({ url: req.url, body });
  });
  const port = server.address().port;
  process.env.ACTION_ITEM_WEBHOOK_URLS = `http://localhost:${port}/a,http://localhost:${port}/b`;

  await sendActionItemWebhook({ transcriptionId: 1, body: 'do work', dueDate: '2024-01-01' });
  server.close();
  assert.equal(received.length, 2);
  const payload = JSON.parse(received[0].body);
  assert.equal(payload.body, 'do work');
  assert.equal(payload.dueDate, '2024-01-01');
});
