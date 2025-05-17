import {
  transcriptions,
  comments,
  transcriptRevisions,
  type Transcription,
  type InsertTranscription,
  type Comment,
  type InsertComment,
} from "@/shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
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
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  deleteTranscription(id: number): Promise<void>;
  listTranscriptions(): Promise<Transcription[]>;
  storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string>;
  getAudioFilePath(id: number): Promise<string | null>;

  createComment(comment: InsertComment): Promise<Comment>;
  getComments(transcriptionId: number): Promise<Comment[]>;
  updateComment(id: number, updates: Partial<Comment>): Promise<Comment | undefined>;
  deleteComment(id: number): Promise<void>;

  saveRevision(transcriptionId: number, snapshot: string, ops: number[]): Promise<void>;
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

// MemStorage class
export class MemStorage implements IStorage {
  private transcriptions: Map<number, Transcription>;
  private comments: Map<number, Comment[]>;
  private currentId: number;
  private commentId: number;

  constructor() {
    this.transcriptions = new Map();
    this.comments = new Map();
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
}

// Switch to DatabaseStorage
export const storage = new DatabaseStorage();
