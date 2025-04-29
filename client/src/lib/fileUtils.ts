// Utility functions for handling file uploads with chunking

/**
 * Maximum chunk size in bytes for file uploads
 * - Files larger than this will be automatically split into chunks
 * - Using 20MB chunks for reliable uploads while supporting files up to 100MB total
 * - Small enough to avoid timeouts and memory issues
 * - Large enough to minimize the number of round trips
 */
export const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Maximum total file size in bytes
 * - Must match server-side limit in routes.ts and schema.ts
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

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