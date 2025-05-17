import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  real,
  numeric,
  varchar,
  bytea,
  jsonb,
  vector
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";


// ─────────────────────────────────────────────
// TRANSCRIPTIONS TABLE
// ─────────────────────────────────────────────

export const transcriptions = pgTable("transcriptions", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  status: text("status").notNull().default("pending"),
  text: text("text"),
  error: text("error"),
  speakerLabels: boolean("speaker_labels").default(false),
  speakerCount: integer("speaker_count"),
  hasTimestamps: boolean("has_timestamps").default(false),
  duration: real("duration"),
  language: text("language"),
  translatedText: text("translated_text"),
  summary: text("summary"),
  actionItems: text("action_items"),
  keywords: text("keywords"),
  meetingTitle: text("meeting_title"),
  meetingDate: timestamp("meeting_date").defaultNow(),
  participants: text("participants"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  structuredTranscript: text("structured_transcript"),
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions).pick({
  fileName: true,
  fileSize: true,
  fileType: true,
  status: true,
  meetingTitle: true,
  meetingDate: true,
  participants: true,
  speakerLabels: true,
  hasTimestamps: true,
  language: true,
  structuredTranscript: true,
});

export const insertTranscriptionSchemaTyped = insertTranscriptionSchema.extend({
  structuredTranscript: z.string().optional().nullable(),
});

export type InsertTranscription = z.infer<typeof insertTranscriptionSchemaTyped>;
export type Transcription = typeof transcriptions.$inferSelect;

// ─────────────────────────────────────────────
// TRANSCRIPTION REVISION HISTORY TABLE
// ─────────────────────────────────────────────

export const transcriptionRevisions = pgTable("transcription_revisions", {
  id: serial("id").primaryKey(),
  transcriptionId: integer("transcription_id")
    .references(() => transcriptions.id)
    .notNull(),
  revisionNo: integer("revision_no").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TranscriptionRevision = typeof transcriptionRevisions.$inferSelect;

// ─────────────────────────────────────────────
// AUDIO FILE VALIDATION
// ─────────────────────────────────────────────

export const audioFileSchema = z.object({
  file: z.any()
    .refine(file => file !== undefined, "File is required")
    .refine(
      file => {
        if (!file || !file.originalname) return false;
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        return ['mp3', 'wav', 'm4a'].includes(ext);
      },
      "Only MP3, WAV, and M4A files are supported"
    )
    .refine(
      file => !file || file.size <= 200 * 1024 * 1024,
      "File size must be less than 200MB"
    ),
});

export type AudioFile = z.infer<typeof audioFileSchema>;

// ─────────────────────────────────────────────
// STRUCTURED TRANSCRIPT TYPES
// ─────────────────────────────────────────────

export const transcriptSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  speaker: z.string().optional(),
  confidence: z.number().optional(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const structuredTranscriptSchema = z.object({
  segments: z.array(transcriptSegmentSchema),
  metadata: z.object({
    speakerCount: z.number().optional(),
    duration: z.number().optional(),
    language: z.string().optional(),
  }).optional(),
});

export type StructuredTranscript = z.infer<typeof structuredTranscriptSchema>;

// ─────────────────────────────────────────────
// COMMENTS TABLE (CANONICAL VERSION)
// ─────────────────────────────────────────────

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcript_id")
    .references(() => transcriptions.id)
    .notNull(),
  yjsPos: jsonb("yjs_pos").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  assignee: text("assignee"),
  createdBy: text("created_by").notNull(),
  dueDate: timestamp("due_date"),
  metadata: jsonb("metadata"),
  absolutePosition: integer("absolute_position").notNull().default(0),
  speaker: varchar("speaker", { length: 64 }),
  timestamp: numeric("timestamp", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCommentSchema = createInsertSchema(comments);
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;

// ─────────────────────────────────────────────
// COLLABORATIVE REVISIONS TABLE
// ─────────────────────────────────────────────

export const collabTranscriptRevisions = pgTable("collab_transcript_revisions", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcription_id")
    .references(() => transcriptions.id)
    .notNull(),
  snapshot: text("snapshot").notNull(),
  ops: integer("ops").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CollabTranscriptRevision = typeof collabTranscriptRevisions.$inferSelect;

// ─────────────────────────────────────────────
// VERSIONED DOCUMENT REVISIONS TABLE
// ─────────────────────────────────────────────

export const transcriptRevisions = pgTable("transcript_revisions", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcript_id")
    .references(() => transcriptions.id)
    .notNull(),
  revNo: integer("rev_no").notNull(),
  doc: bytea("doc").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTranscriptRevisionSchema = createInsertSchema(transcriptRevisions);
export type InsertTranscriptRevision = z.infer<typeof insertTranscriptRevisionSchema>;
export type TranscriptRevision = typeof transcriptRevisions.$inferSelect;

// ─────────────────────────────────────────────
// TRANSCRIPT VECTORS TABLE
// ─────────────────────────────────────────────

export const transcriptVectors = pgTable("transcript_vectors", {
  id: serial("id").primaryKey(),
  transcriptId: integer("transcript_id")
    .notNull()
    .references(() => transcriptions.id),
  chunkId: integer("chunk_id").notNull(),
  speaker: varchar("speaker", { length: 64 }),
  text: text("text"),
  tsStart: numeric("ts_start", { precision: 8, scale: 2 }),
  tsEnd: numeric("ts_end", { precision: 8, scale: 2 }),
  tokenStart: integer("token_start"),
  tokenEnd: integer("token_end"),
  embedding: vector("embedding", { dimensions: 1536 }),
  tags: text("tags").array(),
});

export const insertVectorSchema = createInsertSchema(transcriptVectors);
export type InsertVector = z.infer<typeof insertVectorSchema>;
export type TranscriptVector = typeof transcriptVectors.$inferSelect;