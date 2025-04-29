// Utility functions for handling file uploads with chunking

/**
 * Maximum chunk size in bytes - staying well under Replit's 25MB limit
 */
export const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Checks if file needs to be uploaded in chunks
 */
export function shouldUseChunkedUpload(fileSize: number): boolean {
  return fileSize > MAX_CHUNK_SIZE;
}

/**
 * Splits a file into chunks for uploading
 * @param file The file to split into chunks
 * @param chunkSize Size of each chunk in bytes
 * @returns Array of file chunks
 */
export function splitFileIntoChunks(file: File, chunkSize: number = MAX_CHUNK_SIZE): Blob[] {
  const chunks: Blob[] = [];
  let start = 0;
  
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    chunks.push(chunk);
    start = end;
  }
  
  return chunks;
}