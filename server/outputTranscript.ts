import { transcribeInChunks } from './openai';
import { structuredTranscriptToSRT } from './srt';
import fs from 'fs';

async function main() {
  const filePath = process.argv[2];
  const format = (process.argv[3] || 'text').toLowerCase();
  if (!filePath) {
    console.error('Usage: tsx server/outputTranscript.ts <audio-file> [text|srt|json]');
    process.exit(1);
  }

  try {
    const result = await transcribeInChunks(filePath, { enableTimestamps: format === 'srt' });
    const transcript = {
      segments: result.segments,
      metadata: { duration: result.duration, language: result.language }
    };
    if (format === 'srt') {
      console.log(structuredTranscriptToSRT(transcript));
    } else if (format === 'json') {
      console.log(JSON.stringify({ text: result.text, structuredTranscript: transcript }, null, 2));
    } else {
      console.log(result.text);
    }
  } catch (err) {
    console.error('Failed to create transcript:', err);
    process.exit(1);
  }
}

main();
