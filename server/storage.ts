import { transcriptions, type Transcription, type InsertTranscription } from "@shared/schema";

export interface IStorage {
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
  getTranscription(id: number): Promise<Transcription | undefined>;
  updateTranscription(id: number, updates: Partial<Transcription>): Promise<Transcription | undefined>;
  listTranscriptions(): Promise<Transcription[]>;
}

export class MemStorage implements IStorage {
  private transcriptions: Map<number, Transcription>;
  currentId: number;

  constructor() {
    this.transcriptions = new Map();
    this.currentId = 1;
  }

  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const id = this.currentId++;
    const transcription: Transcription = { ...insertTranscription, id };
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

export const storage = new MemStorage();
