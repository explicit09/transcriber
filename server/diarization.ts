import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface DiarizationSegment {
  start: number;
  end: number;
  speaker: string;
}

export interface DiarizationResult {
  segments: DiarizationSegment[];
}

/**
 * Check if pyannote.audio is installed by testing the Python script
 */
export async function checkDiarizationSetup(): Promise<boolean> {
  try {
    const pythonScript = path.join(process.cwd(), 'python', 'diarization.py');
    
    if (!fs.existsSync(pythonScript)) {
      console.error('Python diarization script not found at:', pythonScript);
      return false;
    }
    
    // Check if Python is available
    const python = await new Promise<boolean>((resolve) => {
      const proc = spawn('python3', ['-c', 'import pyannote.audio; print("OK")']);
      
      proc.stdout.on('data', (data) => {
        if (data.toString().trim() === 'OK') {
          resolve(true);
        }
      });
      
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => {
        if (code !== 0) resolve(false);
      });
    });
    
    return python;
  } catch (error) {
    console.error('Error checking diarization setup:', error);
    return false;
  }
}

/**
 * Run speaker diarization on an audio file using pyannote.audio
 * 
 * @param audioFilePath Path to the audio file
 * @param numSpeakers Optional number of speakers (improves accuracy)
 * @returns Speaker segments with timestamps
 */
export async function diarizeAudio(
  audioFilePath: string,
  numSpeakers?: number
): Promise<DiarizationResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'python', 'diarization.py');
    
    if (!fs.existsSync(pythonScript)) {
      return reject(new Error('Python diarization script not found'));
    }
    
    const args = [pythonScript, audioFilePath];
    if (numSpeakers) {
      args.push(numSpeakers.toString());
    }
    
    // Get HuggingFace token from environment
    const env = {
      ...process.env,
      PYTHONPATH: path.join(process.cwd(), 'python'),
    };
    
    console.log(`Running diarization on ${audioFilePath}`);
    const startTime = Date.now();
    
    const python = spawn('python3', args, { env });
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log real-time progress to console
      console.log(`[Diarization] ${data.toString().trim()}`);
    });
    
    python.on('error', (error) => {
      console.error('Failed to start diarization process:', error);
      reject(new Error(`Failed to start diarization process: ${error.message}`));
    });
    
    python.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Diarization completed in ${duration}s with exit code ${code}`);
      
      if (code !== 0) {
        console.error(`Diarization failed with exit code ${code}:`);
        console.error(stderr);
        reject(new Error(`Diarization failed with exit code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(`Diarization error: ${result.error}`));
          return;
        }
        
        resolve(result);
      } catch (error) {
        console.error('Failed to parse diarization output:', error);
        console.error('Output was:', stdout);
        reject(new Error('Failed to parse diarization output'));
      }
    });
  });
} 