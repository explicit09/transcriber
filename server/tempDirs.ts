import fs from 'fs';
import path from 'path';
import os from 'os';

export interface TempDirs {
  uploadsDir: string;
  chunksDir: string;
  processingDir: string;
}

export function createTempDirs(): TempDirs {
  const baseDir = path.join(os.tmpdir(), 'transcriber');
  const dirs = {
    uploadsDir: path.join(baseDir, 'uploads'),
    chunksDir: path.join(baseDir, 'chunks'),
    processingDir: path.join(baseDir, 'processing')
  };

  // Create all directories
  Object.values(dirs).forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });

  return dirs;
}

export function cleanupTempDirs(dirs: TempDirs) {
  Object.values(dirs).forEach(dir => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup directory ${dir}:`, error);
    }
  });
}

// Create temp directories on module import
export const tempDirs = createTempDirs(); 