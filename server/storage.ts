import { transcriptions, type Transcription, type InsertTranscription } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import fs from 'fs';
import path from 'path';

export interface IStorage {
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  listTranscriptions(): Promise<Transcription[]>;
  deleteTranscription(id: number): Promise<void>;
  storeAudioFile(id: number, audioBuffer: Buffer, fileType: string): Promise<string>;
  getAudioFilePath(id: number): Promise<string | null>;
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
}

// For backwards compatibility, we can keep this class
export class MemStorage implements IStorage {
  private transcriptions: Map<number, Transcription>;
  currentId: number;

  constructor() {
    this.transcriptions = new Map();
    this.currentId = 1;
  }

  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const id = this.currentId++;
    const now = new Date();
    
    // Create transcription with all required fields
    const transcription: Transcription = { 
      ...insertTranscription, 
      id,
      text: null, 
      error: null,
      // Speaker diarization
      speakerLabels: false,
      speakerCount: null,
      // Timestamps
      hasTimestamps: false,
      duration: null,
      // Advanced features
      language: null,
      translatedText: null,
      summary: null,
      actionItems: null,
      keywords: null,
      // Status and metadata
      status: insertTranscription.status || "pending",
      meetingTitle: insertTranscription.meetingTitle || null,
      meetingDate: insertTranscription.meetingDate || now,
      participants: insertTranscription.participants || null,
      // Initialize structured transcript
      structuredTranscript: null, // Initialize as null
      createdAt: now,
      updatedAt: now
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
    
    // Merge updates, ensuring structuredTranscript is handled
    const updatedTranscription = { 
      ...transcription, 
      ...updates, // This will overwrite structuredTranscript if it's in updates
      updatedAt: new Date()
    };
    this.transcriptions.set(id, updatedTranscription);
    return updatedTranscription;
  }

  async listTranscriptions(): Promise<Transcription[]> {
    return Array.from(this.transcriptions.values());
  }
  
  async deleteTranscription(id: number): Promise<void> {
    this.transcriptions.delete(id);
    
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
}

// Switch to DatabaseStorage
export const storage = new DatabaseStorage();