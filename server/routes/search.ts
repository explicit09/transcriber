import { Router, type Request, type Response } from 'express';
import { searchTranscript } from '../search';
import { z, ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';

export const searchRouter = Router();

searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const query = z.string().min(1).parse(req.query.q);
    const transcriptId = z.coerce.number().parse(req.query.transcript_id);
    const top = req.query.top ? z.coerce.number().parse(req.query.top) : 10;
    const tags = typeof req.query.tags === 'string'
      ? req.query.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const speaker = typeof req.query.speaker === 'string' ? req.query.speaker : undefined;
    const start = req.query.start ? Number(req.query.start) : undefined;
    const end = req.query.end ? Number(req.query.end) : undefined;

    let results = await searchTranscript(transcriptId, query, top, tags);
    if (speaker) {
      results = results.filter(r => r.speaker === speaker);
    }
    if (start !== undefined) {
      results = results.filter(r => r.ts_start !== null && r.ts_start >= start);
    }
    if (end !== undefined) {
      results = results.filter(r => r.ts_end !== null && r.ts_end <= end);
    }
    const facets: Record<string, Record<string, number>> = { tags: {}, speakers: {} };
    for (const r of results) {
      if (Array.isArray(r.tags)) {
        for (const t of r.tags) facets.tags[t] = (facets.tags[t] || 0) + 1;
      }
      if (r.speaker) facets.speakers[r.speaker] = (facets.speakers[r.speaker] || 0) + 1;
    }
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
