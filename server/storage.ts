import {
  transcriptions,
  transcriptionRevisions,
  transcriptRevisions,
  comments,
  type Transcription,
  type InsertTranscription,
  type TranscriptionRevision,
  type Comment,
  type InsertComment,
} from "@/shared/schema";

import { db } from "./db";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

export interface IStorage {
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  listTranscriptions(): Promise<Transcription[]>;
  deleteTranscription(id: number): Promise<void>;
  storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string>;
  getAudioFilePath(id: number): Promise<string | null>;
export interface IStorage {
  // Transcriptions
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  deleteTranscription(id: number): Promise<void>;
  listTranscriptions(): Promise<Transcription[]>;
  storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string>;
  getAudioFilePath(id: number): Promise<string | null>;

  // Comments
  createComment(comment: InsertComment): Promise<Comment>;
  getComments(transcriptionId: number): Promise<Comment[]>;
  updateComment(id: number, updates: Partial<Comment>): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<void>;

  // Collaborative Editing Snapshot (if using Yjs)
  saveRevision(transcriptionId: number, snapshot: string, ops: number[]): Promise<void>;

  // Transcription Revision History
  addRevision(transcriptionId: number, text: string): Promise<void>;
  listRevisions(transcriptionId: number): Promise<Pick<TranscriptionRevision, 'revisionNo' | 'createdAt'>[]>;
  getRevision(transcriptionId: number, revisionNo: number): Promise<TranscriptionRevision | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const [transcription] = await db
      .insert(transcriptions)
      .values(insertTranscription)
      .returning();
    return transcription;
  }

  async getTranscription(id: number): Promise<Transcription | undefined> {
    const [transcription] = await db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.id, id));
    return transcription || undefined;
  }

  async updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined> {
    const [updatedTranscription] = await db
      .update(transcriptions)
      .set(updates)
      .where(eq(transcriptions.id, id))
      .returning();
    return updatedTranscription || undefined;
  }

  async listTranscriptions(): Promise<Transcription[]> {
    return await db.select().from(transcriptions);
  }
  
  async deleteTranscription(id: number): Promise<void> {
    await db.delete(transcriptions).where(eq(transcriptions.id, id));
    
    // Also delete the audio file if it exists
    try {
      const audioPath = await this.getAudioFilePath(id);
      if (audioPath) {
        fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error(`Error deleting audio file for transcription ${id}:`, error);
      // Continue with deletion even if audio file deletion fails
    }
  }
  
  async storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string> {
    // Create directory for audio files if it doesn't exist
    const audioDir = path.join(process.cwd(), 'audio-files');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    // Determine file extension based on file type
    let extension = fileType.toLowerCase();
    if (!extension.startsWith('.')) {
      extension = '.' + extension;
    }
    
    // Create filename with transcription ID
    const filename = `transcription-${id}${extension}`;
    const filePath = path.join(audioDir, filename);
    
    // Write the audio buffer to file
    await fs.promises.writeFile(filePath, audioBuffer);
    
    return filePath;
  }
  
  async getAudioFilePath(id: number): Promise<string | null> {
    const audioDir = path.join(process.cwd(), 'audio-files');
    if (!fs.existsSync(audioDir)) {
      return null;
    }
    
    // Check for any file matching the pattern transcription-{id}.*
    const files = fs.readdirSync(audioDir);
    const audioFile = files.find((file: string) => file.startsWith(`transcription-${id}.`));
    
    if (!audioFile) {
      return null;
    }
    
    return path.join(audioDir, audioFile);
  }
// DATABASE STORAGE METHODS FOR TRANSCRIPTION HISTORY
async addRevision(transcriptionId: number, text: string): Promise<void> {
  const revisions = await db
    .select({ revisionNo: transcriptionRevisions.revisionNo })
    .from(transcriptionRevisions)
    .where(eq(transcriptionRevisions.transcriptionId, transcriptionId));

  const nextNo =
    revisions.sort((a, b) => b.revisionNo - a.revisionNo)?.[0]?.revisionNo + 1 || 1;

  await db.insert(transcriptionRevisions).values({
    transcriptionId,
    revisionNo: nextNo,
    text,
  });
}

async listRevisions(transcriptionId: number): Promise<Pick<TranscriptionRevision, 'revisionNo' | 'createdAt'>[]> {
  return db
    .select({
      revisionNo: transcriptionRevisions.revisionNo,
      createdAt: transcriptionRevisions.createdAt,
    })
    .from(transcriptionRevisions)
    .where(eq(transcriptionRevisions.transcriptionId, transcriptionId));
}

async getRevision(transcriptionId: number, revisionNo: number): Promise<TranscriptionRevision | undefined> {
  const [rev] = await db
    .select()
    .from(transcriptionRevisions)
    .where(
      and(
        eq(transcriptionRevisions.transcriptionId, transcriptionId),
        eq(transcriptionRevisions.revisionNo, revisionNo)
      )
    );
  return rev || undefined;
}
  
// MemStorage class
export class MemStorage implements IStorage {
  private transcriptions: Map<number, Transcription>;
  private comments: Map<number, Comment[]>;
  private revisions: Map<number, TranscriptionRevision[]>;
  private currentId: number;
  private commentId: number;

  constructor() {
    this.transcriptions = new Map();
    this.comments = new Map();
    this.revisions = new Map();
    this.currentId = 1;
    this.commentId = 1;
  }


  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const id = this.currentId++;
    const now = new Date();

    const transcription: Transcription = {
      ...insertTranscription,
      id,
      text: null,
      error: null,
      speakerLabels: false,
      speakerCount: null,
      hasTimestamps: false,
      duration: null,
      language: null,
      translatedText: null,
      summary: null,
      actionItems: null,
      keywords: null,
      status: insertTranscription.status || "pending",
      meetingTitle: insertTranscription.meetingTitle || null,
      meetingDate: insertTranscription.meetingDate || now,
      participants: insertTranscription.participants || null,
      structuredTranscript: null,
      createdAt: now,
      updatedAt: now,
    };

    this.transcriptions.set(id, transcription);
    return transcription;
  }

  async getTranscription(id: number): Promise<Transcription | undefined> {
    return this.transcriptions.get(id);
  }

  async updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined> {
    const transcription = this.transcriptions.get(id);
    if (!transcription) return undefined;

    const updated = {
      ...transcription,
      ...updates,
      updatedAt: new Date(),
    };

    this.transcriptions.set(id, updated);
    return updated;
  }

  async listTranscriptions(): Promise<Transcription[]> {
    return Array.from(this.transcriptions.values());
  }

  async deleteTranscription(id: number): Promise<void> {
    this.transcriptions.delete(id);
    try {
      const audioPath = await this.getAudioFilePath(id);
      if (audioPath) {
        fs.unlinkSync(audioPath);
      }
    } catch (error) {
      console.error(`Error deleting audio file for transcription ${id}:`, error);
    }
  }

  async storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string> {
    const audioDir = path.join(process.cwd(), "audio-files");
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    let extension = fileType.toLowerCase();
    if (!extension.startsWith(".")) {
      extension = "." + extension;
    }

    const filename = `transcription-${id}${extension}`;
    const filePath = path.join(audioDir, filename);

    await fs.promises.writeFile(filePath, audioBuffer);
    return filePath;
  }

  async getAudioFilePath(id: number): Promise<string | null> {
    const audioDir = path.join(process.cwd(), "audio-files");
    if (!fs.existsSync(audioDir)) {
      return null;
    }

    const files = fs.readdirSync(audioDir);
    const audioFile = files.find((file) => file.startsWith(`transcription-${id}.`));
    return audioFile ? path.join(audioDir, audioFile) : null;
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const newComment: Comment = {
      id: this.commentId++,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...comment,
    };

    const arr = this.comments.get(comment.transcriptId) || [];
    arr.push(newComment);
    this.comments.set(comment.transcriptId, arr);
    return newComment;
  }

  async getComments(transcriptionId: number): Promise<Comment[]> {
    return this.comments.get(transcriptionId) || [];
  }

  async updateComment(id: number, updates: Partial<Comment>): Promise<Comment | undefined> {
    for (const [transcriptId, commentList] of this.comments.entries()) {
      const index = commentList.findIndex((c) => c.id === id);
      if (index !== -1) {
        const existing = commentList[index];
        const updated = { ...existing, ...updates, updatedAt: new Date() };
        commentList[index] = updated;
        this.comments.set(transcriptId, commentList);
        return updated;
      }
    }
    return undefined;
  }

  async deleteComment(id: number): Promise<void> {
    for (const [transcriptId, commentList] of this.comments.entries()) {
      const filtered = commentList.filter((c) => c.id !== id);
      this.comments.set(transcriptId, filtered);
    }
  }

  async saveRevision(transcriptionId: number, _snapshot: string, _ops: number[]): Promise<void> {
    // no-op in memory
  }

  async addRevision(transcriptionId: number, text: string): Promise<void> {
    const list = this.revisions.get(transcriptionId) || [];
    const nextNo = (list[list.length - 1]?.revisionNo || 0) + 1;
    list.push({
      id: nextNo, // id is not used, but keep field
      transcriptionId,
      revisionNo: nextNo,
      text,
      createdAt: new Date(),
    } as TranscriptionRevision);
    this.revisions.set(transcriptionId, list);
  }

  async listRevisions(transcriptionId: number): Promise<Pick<TranscriptionRevision, 'revisionNo' | 'createdAt'>[]> {
    return (this.revisions.get(transcriptionId) || []).map(r => ({ revisionNo: r.revisionNo, createdAt: r.createdAt }));
  }

  async getRevision(transcriptionId: number, revisionNo: number): Promise<TranscriptionRevision | undefined> {
    const list = this.revisions.get(transcriptionId) || [];
    return list.find(r => r.revisionNo === revisionNo);
  }
}

// Switch to DatabaseStorage
export const storage = new DatabaseStorage();
