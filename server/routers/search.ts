import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { searchTranscript } from '../search';

const router = Router();

router.get('/api/search', async (req: Request, res: Response) => {
  try {
    const query = z.string().min(1).parse(req.query.q);
    const transcriptId = z.coerce.number().parse(req.query.transcript_id);
    const top = req.query.top ? z.coerce.number().parse(req.query.top) : 10;
    const tags = typeof req.query.tags === 'string'
      ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const speaker = req.query.speaker ? String(req.query.speaker) : undefined;
    const start = req.query.start ? Number(req.query.start) : undefined;
    const end = req.query.end ? Number(req.query.end) : undefined;

    const { results, facets } = await searchTranscript(transcriptId, query, top, tags, {
      speaker,
      start,
      end,
    });
    return res.json({ results, facets });
  } catch (err) {
    if (err instanceof ZodError) {
      const message = fromZodError(err).message;
      return res.status(400).json({ message });
    }
    console.error('search error', err);
    return res.status(500).json({ message: 'search failed' });
  }
});

export default router;
