import { Router, type Request, type Response } from 'express';
import { storage } from '../storage';
import { insertCommentSchema, Comment } from '@shared/schema';
import { sendActionItemWebhook } from '../integrations';
import { redis } from '../collab';
import { fromZodError } from 'zod-validation-error';
import { ZodError } from 'zod';
import { insertCommentAnchor } from '../yjsHelpers';

export const commentsRouter = Router();

commentsRouter.get('/:id/comments', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Invalid transcription ID' });
  }
  const transcription = await storage.getTranscription(id);
  if (!transcription) {
    return res.status(404).json({ message: 'Transcription not found' });
  }
  const comments = await storage.getComments(id);
  return res.json(comments);
});

commentsRouter.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid transcription ID' });
    }
    const transcription = await storage.getTranscription(id);
    if (!transcription) {
      return res.status(404).json({ message: 'Transcription not found' });
    }
    const { dueDate, ...commentInput } = req.body;
    const data = insertCommentSchema.parse({
      ...commentInput,
      transcriptId: id,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    });
    const comment = await storage.createComment(data);
    try {
      const doc = redis.getYDoc(`transcription-${id}`);
      insertCommentAnchor(doc, comment.absolutePosition, comment.id);
    } catch (err) {
      console.error('insert comment anchor failed', err);
    }
    if (data.kind === 'action-item') {
      await sendActionItemWebhook({
        transcriptionId: id,
        body: data.body,
        dueDate: typeof dueDate === 'string' ? dueDate : undefined,
      });
    }
    return res.status(201).json(comment);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error('Error creating comment:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

commentsRouter.patch('/:id/comments/:commentId', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(id) || isNaN(commentId)) {
    return res.status(400).json({ message: 'Invalid ID' });
  }
  const transcription = await storage.getTranscription(id);
  if (!transcription) {
    return res.status(404).json({ message: 'Transcription not found' });
  }
  const updates: Partial<Comment> = {
    yjsPos: req.body.yjsPos,
    body: req.body.body,
    kind: req.body.kind,
    status: req.body.status,
    assignee: req.body.assignee,
    createdBy: req.body.createdBy,
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
    metadata: req.body.metadata,
    absolutePosition: req.body.absolutePosition,
  };
  const updated = await storage.updateComment(commentId, updates);
  if (!updated) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  return res.json(updated);
});

commentsRouter.delete('/:id/comments/:commentId', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(id) || isNaN(commentId)) {
    return res.status(400).json({ message: 'Invalid ID' });
  }
  const transcription = await storage.getTranscription(id);
  if (!transcription) {
    return res.status(404).json({ message: 'Transcription not found' });
  }
  await storage.deleteComment(commentId);
  return res.status(204).send();
});
