declare module 'y-redis' {
  import * as Y from 'yjs';

  interface RedisPersistenceOptions {
    host?: string;
    port?: number;
    db?: number;
    prefix?: string;
  }

  export class RedisPersistence {
    constructor(options?: RedisPersistenceOptions);
    getYDoc(docName: string): Y.Doc;
    storeUpdate(docName: string, update: Uint8Array): Promise<void>;
    clearDocument(docName: string): Promise<void>;
    destroy(): void;
  }
} 