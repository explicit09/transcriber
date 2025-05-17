
import { Router, Request, Response } from 'express';
import { insertCommentSchema } from '@shared/schema';
import { storage } from '../storage';
import { sendActionItemWebhook } from '../integrations';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { redis } from '../collab';
import * as Y from 'yjs';

import { insertCommentAnchor } from '../yjsHelpers';

export const commentsRouter = Router();


commentsRouter.get('/api/transcriptions/:id/comments', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid transcription ID' });
  const transcription = await storage.getTranscription(id);
  if (!transcription) return res.status(404).json({ message: 'Transcription not found' });
  const comments = await storage.getComments(id);
  res.json(comments);
});

commentsRouter.post('/api/transcriptions/:id/comments', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: 'Invalid transcription ID' });
  const transcription = await storage.getTranscription(id);
  if (!transcription) return res.status(404).json({ message: 'Transcription not found' });

  try {

    const { dueDate, ...commentInput } = req.body;
    const data = insertCommentSchema.parse({
      ...commentInput,
      transcriptId: id,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    });
    const comment = await storage.createComment(data);

    if (data.kind === 'action-item') {
      await sendActionItemWebhook({
        transcriptionId: id,
        body: data.body,
        dueDate: typeof dueDate === 'string' ? dueDate : undefined,
      });
    }


    try {
      const doc = redis.getYDoc(`transcription-${id}`);
      insertCommentAnchor(doc, comment.id, data.absolutePosition ?? -1);
    } catch (err) {
      console.error('Failed to insert comment anchor', err);
    }


    return res.status(201).json(comment);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }

    return res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

commentsRouter.patch('/api/transcriptions/:id/comments/:commentId', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(id) || isNaN(commentId)) return res.status(400).json({ message: 'Invalid ID' });
  const transcription = await storage.getTranscription(id);
  if (!transcription) return res.status(404).json({ message: 'Transcription not found' });

  const updates = {

    yjsPos: req.body.yjsPos,
    body: req.body.body,
    kind: req.body.kind,
    status: req.body.status,
    assignee: req.body.assignee,
    createdBy: req.body.createdBy,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    metadata: req.body.metadata,
    absolutePosition: req.body.absolutePosition,

  } as any;

  const updated = await storage.updateComment(commentId, updates);
  if (!updated) return res.status(404).json({ message: 'Comment not found' });
  res.json(updated);
});

commentsRouter.delete('/api/transcriptions/:id/comments/:commentId', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(id) || isNaN(commentId)) return res.status(400).json({ message: 'Invalid ID' });
  const transcription = await storage.getTranscription(id);
  if (!transcription) return res.status(404).json({ message: 'Transcription not found' });
  await storage.deleteComment(commentId);
  res.status(204).send();

});
