import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tempDirs } from './tempDirs';

const execFilePromise = promisify(execFile);

// Lowered from 24MB to ~23MB for safety margin
const DEFAULT_CHUNK_SIZE = 23 * 1024 * 1024;
const OPENAI_LIMIT_BYTES = 25 * 1024 * 1024;
const MAX_CHUNK_DURATION = 600; // 10 minutes max per chunk

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

// Helper: Verify chunk size and split if needed
async function verifyAndSplitChunk(
  filePath: string,
  chunkPath: string,
  start: number,
  end: number,
  targetSize: number
): Promise<AudioChunk[]> {
  const stats = fs.statSync(chunkPath);
  if (stats.size <= targetSize) {
    console.log(`Chunk size OK: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    return [{ filePath: chunkPath, start, end }];
  }

  console.warn(`Chunk size ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds target ${(targetSize / 1024 / 1024).toFixed(2)}MB - splitting`);
  
  // Remove oversized chunk
  fs.unlinkSync(chunkPath);
  
  // Calculate midpoint and split
  const midDuration = (end - start) / 2;
  const midPoint = start + midDuration;
  
  const chunks: AudioChunk[] = [];
  const ext = path.extname(chunkPath);
  const baseDir = path.dirname(chunkPath);
  
  // Split into two parts
  const firstHalf = path.join(baseDir, `${path.basename(chunkPath, ext)}-1${ext}`);
  const secondHalf = path.join(baseDir, `${path.basename(chunkPath, ext)}-2${ext}`);
  
  try {
    // Create first half
    await execFilePromise('ffmpeg', [
      '-i', filePath,
      '-ss', start.toFixed(3),
      '-to', midPoint.toFixed(3),
      '-c', 'copy',
      firstHalf,
      '-y'
    ]);
    const firstHalfChunks = await verifyAndSplitChunk(filePath, firstHalf, start, midPoint, targetSize);
    chunks.push(...firstHalfChunks);

    // Create second half
    await execFilePromise('ffmpeg', [
      '-i', filePath,
      '-ss', midPoint.toFixed(3),
      '-to', end.toFixed(3),
      '-c', 'copy',
      secondHalf,
      '-y'
    ]);
    const secondHalfChunks = await verifyAndSplitChunk(filePath, secondHalf, midPoint, end, targetSize);
    chunks.push(...secondHalfChunks);
    
    return chunks;
  } catch (error) {
    // Clean up temporary files
    [firstHalf, secondHalf].forEach(p => {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        console.warn(`Failed to cleanup temp file ${p}:`, e);
      }
    });
    throw error;
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

    // Calculate maximum duration for target chunk size
    const maxDuration = Math.min(chunkSize / bytesPerSecond, MAX_CHUNK_DURATION);
    console.log(`Target chunk size: ${(chunkSize / 1024 / 1024).toFixed(2)}MB, max duration: ${maxDuration.toFixed(2)}s`);

    // Group silence points into chunks <= chunkSize
    const chunks: { start: number; end: number }[] = [];
    let chunkStart = silencePoints[0];
    
    for (let i = 1; i < silencePoints.length; i++) {
      const candidateEnd = silencePoints[i];
      const chunkBytes = (candidateEnd - chunkStart) * bytesPerSecond;
      const chunkDuration = candidateEnd - chunkStart;
      
      // Force split if chunk would be too large or too long
      if (chunkBytes >= chunkSize || chunkDuration >= maxDuration || i === silencePoints.length - 1) {
        if (i === 1) {
          // First silence point - force an earlier cut if needed
          if (chunkBytes > chunkSize || chunkDuration > maxDuration) {
            const forcedEnd = chunkStart + Math.min(maxDuration, chunkSize / bytesPerSecond);
            chunks.push({ start: chunkStart, end: forcedEnd });
            chunkStart = forcedEnd;
            i--; // Re-evaluate this silence point
            continue;
          }
        }
        
        // If too big and not first chunk, use previous silence point
        if ((chunkBytes > chunkSize || chunkDuration > maxDuration) && i > 1) {
          const prevEnd = silencePoints[i - 1];
          chunks.push({ start: chunkStart, end: prevEnd });
          chunkStart = prevEnd;
          i--; // Re-evaluate this silence point
        } else {
          chunks.push({ start: chunkStart, end: candidateEnd });
          chunkStart = candidateEnd;
        }
      }
    }

    // If no chunks were created (no suitable silence points), force split by duration
    if (chunks.length === 0) {
      console.warn('No suitable silence points found - falling back to duration-based splitting');
      const numChunks = Math.ceil(duration / maxDuration);
      const targetDuration = duration / numChunks;
      
      for (let i = 0; i < numChunks; i++) {
        const start = i * targetDuration;
        const end = Math.min(start + targetDuration, duration);
        chunks.push({ start, end });
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

    // Write out each chunk using ffmpeg and verify size
    const ext = path.extname(filePath);
    const chunkResults: AudioChunk[] = [];
    const failedChunks: Array<{ start: number; end: number; error: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const { start, end } = chunks[i];
      const outPath = path.join(processingDir, `part-${String(i + 1).padStart(3, '0')}${ext}`);
      
      try {
        // Create initial chunk
        await execFilePromise('ffmpeg', [
          '-i', filePath,
          '-ss', start.toFixed(3),
          '-to', end.toFixed(3),
          '-c', 'copy',
          outPath,
          '-y',
        ]);

        // Verify size and split if needed
        const verifiedChunks = await verifyAndSplitChunk(filePath, outPath, start, end, chunkSize);
        chunkResults.push(...verifiedChunks);
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
