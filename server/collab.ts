// Collaborative editing is handled by the y-websocket-server binary.
// To run the server:
// npx y-websocket-server --port 1234 --maxPayloadSize 104857600
// Configure VITE_COLLAB_URL in the client to point to ws://localhost:1234

import { RedisPersistence } from 'y-redis';

// Use process.env directly since it's globally available in Node.js
export const redis = new RedisPersistence({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
});
