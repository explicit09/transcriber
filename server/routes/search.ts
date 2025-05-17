import { Router, Request, Response } from 'express';
import { searchTranscriptWithFacets } from '../search';
import { z, ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';

export const searchRouter = Router();

searchRouter.get('/api/search', async (req: Request, res: Response) => {
  try {
    const query = z.string().min(1).parse(req.query.q);
    const transcriptId = z.coerce.number().parse(req.query.transcript_id);
    const top = req.query.top ? z.coerce.number().parse(req.query.top) : 10;
    const tags = typeof req.query.tags === 'string'
      ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const speakers = typeof req.query.speakers === 'string'
      ? req.query.speakers.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const start = req.query.start ? Number(req.query.start) : undefined;
    const end = req.query.end ? Number(req.query.end) : undefined;
    const { results, facets } = await searchTranscriptWithFacets(transcriptId, query, top, { tags, speakers, start, end });
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
