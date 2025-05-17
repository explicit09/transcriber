export async function sendActionItemWebhook(data: { transcriptionId: number; body: string }) {
  const urls = (process.env.ACTION_ITEM_WEBHOOK_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
  for (const url of urls) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error(`Failed to call webhook ${url}:`, err);
    }
  }
}
