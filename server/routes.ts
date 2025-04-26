import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTranscriptionSchema, audioFileSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { transcribeAudio } from "./openai";
import { z } from "zod";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

// Setup multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(os.tmpdir(), 'audio-uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only MP3, WAV, and M4A files are allowed."));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload and transcribe audio file
  app.post('/api/transcribe', upload.single('file'), async (req: Request, res: Response) => {
    try {
      // Validate file
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      try {
        audioFileSchema.parse({ file: req.file });
      } catch (error) {
        if (error instanceof ZodError) {
          const validationError = fromZodError(error);
          return res.status(400).json({ message: validationError.message });
        }
        return res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
      }

      // Create transcription record (we already checked req.file exists above)
      const file = req.file!;
      const transcription = await storage.createTranscription({
        fileName: file.originalname,
        fileSize: file.size,
        fileType: path.extname(file.originalname).substring(1),
        status: "processing",
      });

      // Process transcription in the background
      (async () => {
        try {
          // Transcribe the audio file (we already checked req.file exists above)
          const filePath = file.path;
          const result = await transcribeAudio(filePath);
          
          // Update the transcription record
          await storage.updateTranscription(transcription.id, {
            text: result.text,
            status: "completed",
          });

          // Clean up the file
          fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting file: ${err?.message || 'Unknown error'}`);
          });
        } catch (error) {
          // Handle errors and update the record
          const errorMessage = error instanceof Error ? error.message : String(error);
          await storage.updateTranscription(transcription.id, {
            error: errorMessage,
            status: "error",
          });

          // Clean up the file even on error
          fs.unlink(file.path, (err) => {
            if (err) console.error(`Error deleting file: ${err?.message || 'Unknown error'}`);
          });
        }
      })();

      // Return the transcription ID
      return res.status(202).json({ 
        id: transcription.id,
        message: "Transcription processing started" 
      });
    } catch (error) {
      console.error("Error handling transcription request:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get transcription status
  app.get('/api/transcriptions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }

      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }

      return res.status(200).json(transcription);
    } catch (error) {
      console.error("Error retrieving transcription:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Get all transcriptions
  app.get('/api/transcriptions', async (req: Request, res: Response) => {
    try {
      const transcriptions = await storage.listTranscriptions();
      return res.status(200).json(transcriptions);
    } catch (error) {
      console.error("Error retrieving transcriptions:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
