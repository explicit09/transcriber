import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { storage } from '../storage';
import { insertCommentSchema } from '@/shared/schema';
import { sendActionItemWebhook } from '../integrations';
import { redis } from '../collab';
import { insertCommentAnchor } from '../yjsHelpers';
import { parseDueDate } from '../openai';

const router = Router();

async function normalizeDueDate(input: any): Promise<{ date?: Date; iso?: string }> {
  if (!input) return {};
  const d = new Date(input);
  if (!isNaN(d.getTime())) return { date: d, iso: d.toISOString() };
  const iso = await parseDueDate(String(input));
  if (iso) {
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return { date: parsed, iso };
  }
  return {};
}

router.get('/api/transcriptions/:id/comments', async (req: Request, res: Response) => {
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

router.post('/api/transcriptions/:id/comments', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Invalid transcription ID' });
  }

  const transcription = await storage.getTranscription(id);
  if (!transcription) {
    return res.status(404).json({ message: 'Transcription not found' });
  }

  try {
    const { dueDate, ...commentInput } = req.body;
    const parsed = await normalizeDueDate(dueDate);
    const data = insertCommentSchema.parse({
      ...commentInput,
      transcriptId: id,
      dueDate: parsed.date,
    });
    const comment = await storage.createComment(data);

    try {
      const doc = redis.getYDoc(`transcription-${id}`);
      insertCommentAnchor(doc, data.absolutePosition ?? 0, comment.id);
    } catch (err) {
      console.error('Failed to insert comment anchor', err);
    }

    if (data.kind === 'action-item') {
      await sendActionItemWebhook({
        transcriptionId: id,
        body: data.body,
        dueDate: parsed.iso,
      });
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

router.patch('/api/transcriptions/:id/comments/:commentId', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const commentId = parseInt(req.params.commentId);
  if (isNaN(id) || isNaN(commentId)) {
    return res.status(400).json({ message: 'Invalid ID' });
  }

  const transcription = await storage.getTranscription(id);
  if (!transcription) {
    return res.status(404).json({ message: 'Transcription not found' });
  }

  const parsed = await normalizeDueDate(req.body.dueDate);
  const updates = {
    yjsPos: req.body.yjsPos,
    body: req.body.body,
    kind: req.body.kind,
    status: req.body.status,
    assignee: req.body.assignee,
    createdBy: req.body.createdBy,
    dueDate: parsed.date,
    metadata: req.body.metadata,
    absolutePosition: req.body.absolutePosition,
  } as any;

  const updated = await storage.updateComment(commentId, updates);
  if (!updated) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  return res.json(updated);
});

router.delete('/api/transcriptions/:id/comments/:commentId', async (req: Request, res: Response) => {
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

export default router;
