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
