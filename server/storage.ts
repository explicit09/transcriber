import { transcriptions, type Transcription, type InsertTranscription } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  listTranscriptions(): Promise<Transcription[]>;
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
    const transcription: Transcription = { 
      ...insertTranscription, 
      id,
      text: null, 
      error: null 
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
    
    const updatedTranscription = { ...transcription, ...updates };
    this.transcriptions.set(id, updatedTranscription);
    return updatedTranscription;
  }

  async listTranscriptions(): Promise<Transcription[]> {
    return Array.from(this.transcriptions.values());
  }
}

// Switch to DatabaseStorage
export const storage = new DatabaseStorage();
