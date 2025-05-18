import { transcribeInChunks } from './openai';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx server/chunkTranscription.ts <audio-file>');
    process.exit(1);
  }

  try {
    const result = await transcribeInChunks(filePath, { enableTimestamps: true });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Transcription failed:', err);
    process.exit(1);
  }
}

main();
