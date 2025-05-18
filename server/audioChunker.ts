import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tempDirs } from './tempDirs';

const execFilePromise = promisify(execFile);

const DEFAULT_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB to stay under 25MB API limit

export interface AudioChunk {
  filePath: string;
  start: number;
  end: number;
}

export interface AudioChunkingResult {
  chunks: AudioChunk[];
  failedChunks: Array<{
    start: number;
    end: number;
    error: string;
  }>;
  duration: number;
}

export async function getAudioDuration(filePath: string): Promise<number> {
  try {
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
  } catch (error) {
    throw new Error(`Failed to get audio duration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper: Detect silence points in the audio using ffmpeg
async function detectSilencePoints(filePath: string, silenceLen = 0.5, silenceThresh = -35): Promise<number[]> {
  try {
    const { stdout, stderr } = await execFilePromise('ffmpeg', [
      '-i', filePath,
      '-af', `silencedetect=noise=${silenceThresh}dB:d=${silenceLen}`,
      '-f', 'null',
      '-'
    ]);
    const output = stdout + stderr;
    const silenceEndRegex = /silence_end: (\d+\.?\d*)/g;
    const points: number[] = [];
    let match;
    while ((match = silenceEndRegex.exec(output)) !== null) {
      points.push(parseFloat(match[1]));
    }
    return points;
  } catch (error) {
    throw new Error(`Failed to detect silence points: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Main: Split audio at silence points, ensuring each chunk is <= chunkSize, with optional overlap
export async function splitAudio(
  filePath: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlapSeconds = 1.0 // default 1 second overlap
): Promise<AudioChunkingResult> {
  try {
    const { size } = fs.statSync(filePath);
    const duration = await getAudioDuration(filePath);
    const bytesPerSecond = size / duration;

    // Detect silence points
    let silencePoints = await detectSilencePoints(filePath);
    // Always include 0 and duration as boundaries
    silencePoints = [0, ...silencePoints.filter(t => t > 0 && t < duration), duration];

    // Group silence points into chunks <= chunkSize
    const chunks: { start: number; end: number }[] = [];
    let chunkStart = silencePoints[0];
    for (let i = 1; i < silencePoints.length; i++) {
      const candidateEnd = silencePoints[i];
      const chunkBytes = (candidateEnd - chunkStart) * bytesPerSecond;
      if (chunkBytes >= chunkSize || i === silencePoints.length - 1) {
        // If too big, use previous silence point as end
        if (chunkBytes > chunkSize && i > 1) {
          const prevEnd = silencePoints[i - 1];
          chunks.push({ start: chunkStart, end: prevEnd });
          chunkStart = prevEnd;
          i--; // re-evaluate this silence point as start of next chunk
        } else {
          chunks.push({ start: chunkStart, end: candidateEnd });
          chunkStart = candidateEnd;
        }
      }
    }

    // Add overlap to each chunk except the last
    for (let i = 0; i < chunks.length - 1; i++) {
      const nextStart = chunks[i + 1].start;
      const newEnd = Math.min(chunks[i].end + overlapSeconds, nextStart, duration);
      chunks[i].end = newEnd;
    }
    // Ensure last chunk does not exceed duration
    if (chunks.length > 0) {
      chunks[chunks.length - 1].end = Math.min(chunks[chunks.length - 1].end, duration);
    }

    // Create a unique processing directory for this file
    const processingDir = path.join(tempDirs.processingDir, `chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(processingDir, { recursive: true });

    // Write out each chunk using ffmpeg
    const ext = path.extname(filePath);
    const chunkResults: AudioChunk[] = [];
    const failedChunks: Array<{ start: number; end: number; error: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const { start, end } = chunks[i];
      const outPath = path.join(processingDir, `part-${String(i + 1).padStart(3, '0')}${ext}`);
      
      try {
        await execFilePromise('ffmpeg', [
          '-i', filePath,
          '-ss', start.toFixed(3),
          '-to', end.toFixed(3),
          '-c', 'copy',
          outPath,
          '-y',
        ]);
        chunkResults.push({ filePath: outPath, start, end });
      } catch (error) {
        failedChunks.push({
          start,
          end,
          error: error instanceof Error ? error.message : String(error)
        });
        // Try to clean up the failed chunk file if it exists
        try {
          if (fs.existsSync(outPath)) {
            fs.unlinkSync(outPath);
          }
        } catch (cleanupError) {
          console.warn(`Failed to cleanup failed chunk ${outPath}:`, cleanupError);
        }
      }
    }

    return {
      chunks: chunkResults,
      failedChunks,
      duration
    };
  } catch (error) {
    throw new Error(`Failed to split audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}
