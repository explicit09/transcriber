export interface ActionItemData {
  transcriptionId: number;
  body: string;
  dueDate?: string;
}

function getWebhookUrls(): string[] {
  const urls: string[] = [];
  if (process.env.CLICKUP_WEBHOOK_URL) {
    urls.push(process.env.CLICKUP_WEBHOOK_URL);
  }
  if (process.env.NOTION_WEBHOOK_URL) {
    urls.push(process.env.NOTION_WEBHOOK_URL);
  }
  if (process.env.ACTION_ITEM_WEBHOOK_URLS) {
    urls.push(
      ...process.env.ACTION_ITEM_WEBHOOK_URLS
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    );
  }
  return urls;
}

export async function sendActionItemWebhook(data: ActionItemData): Promise<void> {
  const urls = getWebhookUrls();
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
