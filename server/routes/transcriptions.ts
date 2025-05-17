import { Router, type Request, type Response } from 'express';
import { redis } from '../collab';
import { storage } from '../storage';
import { extractPlainText } from '../yjsHelpers';
import * as Y from 'yjs';
import jwt from 'jsonwebtoken';
import { scheduleReindex } from '../search';

export const transcriptionsRouter = Router();

transcriptionsRouter.get('/:id/collab-token', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid transcription ID' });
    }
    const transcription = await storage.getTranscription(id);
    if (!transcription) {
      return res.status(404).json({ message: 'Transcription not found' });
    }
    const scopesParam = req.query.scopes;
    let scopes: string[] = [];
    if (typeof scopesParam === 'string') {
      scopes = scopesParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s === 'read' || s === 'write');
    }
    if (scopes.length === 0) scopes = ['read'];
    const secret = process.env.COLLAB_TOKEN_SECRET;
    if (!secret) {
      return res.status(500).json({ message: 'Collaboration token secret is not configured' });
    }
    const token = jwt.sign({ transcriptionId: id, scopes }, secret, { expiresIn: '2h' });
    return res.status(200).json({ token });
  } catch (err) {
    console.error('Error generating collaboration token:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

transcriptionsRouter.post('/:id/save-collab', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid transcription ID' });
    }
    const doc = redis.getYDoc(`transcription-${id}`);
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    const text = extractPlainText(doc);
    await storage.saveRevision(id, snapshot, 0);
    await storage.updateTranscription(id, { text, updatedAt: new Date() });
    await storage.addRevision(id, text);
    scheduleReindex(id);
    return res.status(204).end();
  } catch (error) {
    console.error('Error saving collaboration snapshot:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
