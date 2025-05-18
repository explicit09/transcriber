import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFilePromise = promisify(execFile);

const DEFAULT_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to stay under 25MB API limit

export async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFilePromise('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

export async function splitAudio(
  filePath: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<string[]> {
  const { size } = fs.statSync(filePath);
  const duration = await getAudioDuration(filePath);
  const bytesPerSecond = size / duration;
  const segmentTime = Math.max(1, Math.floor(chunkSize / bytesPerSecond));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-chunk-'));
  const outPattern = path.join(dir, `part-%03d${path.extname(filePath)}`);

  await execFilePromise('ffmpeg', [
    '-i',
    filePath,
    '-f',
    'segment',
    '-segment_time',
    segmentTime.toString(),
    '-c',
    'copy',
    outPattern,
  ]);

  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('part-'))
    .map((f) => path.join(dir, f))
    .sort();
}
