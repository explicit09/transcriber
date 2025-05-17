ALTER TABLE comments ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS due_date timestamp;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS absolute_position integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_comments_transcript_position ON comments(transcript_id, absolute_position);
