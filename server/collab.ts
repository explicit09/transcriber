import { Server } from 'http';
import { WebSocketServer } from 'ws';
import { verify } from 'jsonwebtoken';
import { setupWSConnection } from 'y-websocket/bin/utils.js';
import { RedisPersistence } from 'y-redis';
import * as Y from 'yjs';
import { storage } from './storage';
import { scheduleReindex } from './search';
import { extractPlainText } from './yjsHelpers';

interface DocInfo {
  doc: Y.Doc;
  ops: number;
  lastSave: number;
  timer: NodeJS.Timeout;
}

export const redis = new RedisPersistence({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
});

const docs = new Map<string, DocInfo>();

function trackDoc(name: string, doc: Y.Doc) {
  if (docs.has(name)) return docs.get(name)!;

  let info: DocInfo;
  const save = async () => {
    if (info.ops === 0) return;
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    const id = Number(name.replace(/^transcription-/, ''));
    if (!Number.isNaN(id)) {
      try {
        const text = extractPlainText(doc);
        await storage.saveRevision(id, snapshot, info.ops);
        await storage.updateTranscription(id, { text, updatedAt: new Date() });
        await storage.addRevision(id, text);
        scheduleReindex(id);
      } catch (err) {
        console.error('collab autosave failed', err);
      }
    }
    info.ops = 0;
    info.lastSave = Date.now();
  };

  info = {
    doc,
    ops: 0,
    lastSave: Date.now(),
    timer: setInterval(() => {
      if (Date.now() - info.lastSave >= 5 * 60 * 1000) {
        void save();
      }
    }, 60 * 1000),
  };

  doc.on('update', () => {
    info.ops++;
    if (info.ops >= 500) {
      void save();
    }
  });

  docs.set(name, info);
  return info;
}

export function startCollabGateway(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/collab')) return;
    const url = new URL(req.url, 'http://localhost');
    const token =
      url.searchParams.get('token') ||
      (req.headers['sec-websocket-protocol']?.split(',')[0] ?? '');
    try {
      const payload = verify(
        token,
        process.env.COLLAB_TOKEN_SECRET || process.env.JWT_SECRET || 'secret'
      ) as { transcriptionId?: number; scopes?: string[] };
      const idMatch = url.pathname.match(/transcription-(\d+)/);
      const docId = idMatch ? Number(idMatch[1]) : NaN;
      if (!payload.transcriptionId || payload.transcriptionId !== docId) {
        throw new Error('Invalid transcriptionId');
      }
      (req as any).collabScopes = Array.isArray(payload.scopes)
        ? payload.scopes
        : [];
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const docName = url.pathname.replace(/^\/collab\/?/, '');
    const doc = redis.getYDoc(docName);
    trackDoc(docName, doc);
    setupWSConnection(ws, req, { docName, doc, persistence: redis });
  });
}
