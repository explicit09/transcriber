import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const transcriptions = pgTable("transcriptions", {
  id: serial("id").primaryKey(),
  // File metadata
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  // Transcription status and content
  status: text("status").notNull().default("pending"),
  text: text("text"),
  error: text("error"),
  // Speaker diarization
  speakerLabels: boolean("speaker_labels").default(false),
  speakerCount: integer("speaker_count"),
  // Transcript timestamps
  hasTimestamps: boolean("has_timestamps").default(false),
  duration: integer("duration"), // Audio duration in seconds
  // Advanced features
  language: text("language"), // Detected language
  translatedText: text("translated_text"), // Translated version
  summary: text("summary"), // AI generated summary
  keywords: text("keywords"), // Extracted keywords
  // Meeting metadata
  meetingTitle: text("meeting_title"),
  meetingDate: timestamp("meeting_date").defaultNow(),
  participants: text("participants"),
  // Created/updated timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions).pick({
  fileName: true,
  fileSize: true,
  fileType: true,
  status: true,
  meetingTitle: true,
  meetingDate: true,
  participants: true,
});

export type InsertTranscription = z.infer<typeof insertTranscriptionSchema>;
export type Transcription = typeof transcriptions.$inferSelect;

// Schema for file upload
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
      file => !file || file.size <= 25 * 1024 * 1024,
      "File size must be less than 25MB"
    ),
});

export type AudioFile = z.infer<typeof audioFileSchema>;

// Types for timestamps and speaker diarization
export const transcriptSegmentSchema = z.object({
  start: z.number(), // Start time in seconds
  end: z.number(), // End time in seconds
  text: z.string(), // Text for this segment
  speaker: z.string().optional(), // Speaker identifier (e.g., "Speaker 1")
  confidence: z.number().optional(), // Confidence score 0-1
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

// Schema for structured transcript with timestamps and speakers
export const structuredTranscriptSchema = z.object({
  segments: z.array(transcriptSegmentSchema),
  metadata: z.object({
    speakerCount: z.number().optional(),
    duration: z.number().optional(), // Total duration in seconds
    language: z.string().optional(), // Detected language
  }).optional(),
});

export type StructuredTranscript = z.infer<typeof structuredTranscriptSchema>;
