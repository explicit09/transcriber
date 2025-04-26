import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertTranscriptionSchema, 
  audioFileSchema, 
  structuredTranscriptSchema, 
  StructuredTranscript 
} from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { 
  transcribeAudio, 
  transcribeAudioWithFeatures, 
  generateTranscriptSummary, 
  translateTranscript 
} from "./openai";
import { generateTranscriptPDF } from "./pdf";
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

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

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
      
      // Extract meeting metadata from the request
      const meetingTitle = req.body.meetingTitle || null;
      const meetingDate = req.body.meetingDate ? new Date(req.body.meetingDate) : new Date();
      const participants = req.body.participants || null;
      
      // Extract advanced options
      const enableSpeakerLabels = req.body.enableSpeakerLabels === 'true' || req.body.enableSpeakerLabels === true;
      const enableTimestamps = req.body.enableTimestamps === 'true' || req.body.enableTimestamps === true;
      const language = req.body.language || null;
      const generateSummary = req.body.generateSummary === 'true' || req.body.generateSummary === true;
      
      const transcription = await storage.createTranscription({
        fileName: file.originalname,
        fileSize: file.size,
        fileType: path.extname(file.originalname).substring(1),
        status: "processing",
        meetingTitle,
        meetingDate,
        participants,
        speakerLabels: enableSpeakerLabels,
        hasTimestamps: enableTimestamps,
        language,
      });

      // Store the audio file for later use with the interactive transcript
      try {
        const fileBuffer = fs.readFileSync(file.path);
        await storage.storeAudioFile(
          transcription.id,
          fileBuffer,
          path.extname(file.originalname)
        );
      } catch (audioStoreError) {
        console.error("Error storing audio file:", audioStoreError);
        // Continue with transcription even if audio storage fails
      }

      // Process transcription in the background
      (async () => {
        try {
          // Transcribe the audio file (we already checked req.file exists above)
          const filePath = file.path;
          
          // Use the enhanced transcription if any advanced features are enabled
          if (enableSpeakerLabels || enableTimestamps) {
            const result = await transcribeAudioWithFeatures(filePath, {
              enableSpeakerDiarization: enableSpeakerLabels,
              enableTimestamps: enableTimestamps,
              language: language || undefined,
            });
            
            // Format the transcript text with speaker labels if speaker diarization is enabled
            let formattedText = result.text;
            if (enableSpeakerLabels && result.structuredTranscript.segments.length > 0) {
              formattedText = result.structuredTranscript.segments.map(segment => {
                const timeStr = enableTimestamps ? `[${formatTime(segment.start)}] ` : '';
                const speakerStr = segment.speaker ? `${segment.speaker}: ` : '';
                return `${timeStr}${speakerStr}${segment.text}`;
              }).join('\n\n');
            }
            
            // Generate a summary if requested
            let summary = null;
            let keywords = null;
            let actionItems = null;
            
            if (generateSummary && result.text) {
              try {
                // Apply threshold checks
                const wordCount = result.text.split(/\s+/).filter(Boolean).length;
                const lineCount = result.text.split('\n').filter(line => line.trim().length > 0).length;
                
                // Only generate summaries for substantial content (relaxed thresholds)
                if (result.text.length >= 100 && wordCount >= 15) { // Reduced thresholds
                  const summaryResult = await generateTranscriptSummary(result.text);
                  summary = summaryResult.summary;
                  actionItems = summaryResult.actionItems?.length 
                    ? summaryResult.actionItems.join('\n') 
                    : null;
                  keywords = summaryResult.keywords.join(', ');
                } else {
                  // For short content, use a standard message
                  summary = "The transcript is too brief for a meaningful summary.";
                }
              } catch (summaryError) {
                console.error("Error generating summary:", summaryError);
              }
            }
            
            // Update the transcription record with enhanced data
            await storage.updateTranscription(transcription.id, {
              text: formattedText,
              status: "completed",
              updatedAt: new Date(),
              speakerCount: result.structuredTranscript.metadata?.speakerCount || null,
              duration: result.duration || null,
              language: result.language || null,
              summary,
              keywords,
              actionItems,
              speakerLabels: enableSpeakerLabels && result.structuredTranscript.segments.some(s => s.speaker),
              hasTimestamps: enableTimestamps,
              // Store structured transcript as JSON string
              structuredTranscript: JSON.stringify(result.structuredTranscript) 
            });
          } else {
            // Use basic transcription for simple cases
            const result = await transcribeAudio(filePath);
            
            // Update the transcription record
            await storage.updateTranscription(transcription.id, {
              text: result.text,
              status: "completed",
              updatedAt: new Date(),
              duration: result.duration || null,
              language: result.language || null,
              speakerLabels: false,
              hasTimestamps: false,
              // Store null for structured transcript when using basic transcription
              structuredTranscript: null 
            });
          }

          // Clean up the file
          fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting file: ${err?.message || 'Unknown error'}`);
          });
        } catch (error) {
          // Handle errors and update the record (Original simpler error handling)
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("Error during transcription processing:", errorMessage);
          await storage.updateTranscription(transcription.id, {
            error: errorMessage,
            status: "error",
            updatedAt: new Date(),
            // Ensure structuredTranscript is null on error
            structuredTranscript: null
          });

          // Clean up the file even on error (Original path)
          fs.unlink(file.path, (err) => { 
            if (err) console.error(`Error deleting file after error: ${err?.message || 'Unknown error'}`);
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
      
      // Parse structured transcript from JSON string if it exists
      let structuredTranscript = null;
      if (transcription.structuredTranscript) {
        try {
          structuredTranscript = JSON.parse(transcription.structuredTranscript);
        } catch (e) {
          console.error("Failed to parse structuredTranscript JSON:", e);
          // Optionally return an error or just leave it null
        }
      }

      // Return the transcription object with the parsed structured data
      return res.status(200).json({ 
        ...transcription,
        structuredTranscript: structuredTranscript // Send parsed object
      });
    } catch (error) {
      console.error("Error retrieving transcription:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Get all transcriptions
  app.get('/api/transcriptions', async (req: Request, res: Response) => {
    try {
      const transcriptions = await storage.listTranscriptions();
      
      // Parse structured transcript for each item
      const processedTranscriptions = transcriptions.map(t => {
        let structuredTranscript = null;
        if (t.structuredTranscript) {
          try {
            structuredTranscript = JSON.parse(t.structuredTranscript);
          } catch (e) {
            console.error(`Failed to parse structuredTranscript for ID ${t.id}:`, e);
          }
        }
        return { ...t, structuredTranscript };
      });
      
      return res.status(200).json(processedTranscriptions);
    } catch (error) {
      console.error("Error retrieving transcriptions:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Update a transcription
  app.patch('/api/transcriptions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text field is required and must be a string" });
      }
      
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      const updatedTranscription = await storage.updateTranscription(id, {
        text,
        updatedAt: new Date(),
      });
      
      return res.status(200).json(updatedTranscription);
    } catch (error) {
      console.error("Error updating transcription:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Delete a transcription
  app.delete('/api/transcriptions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      await storage.deleteTranscription(id);
      
      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting transcription:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Generate summary for a transcription
  app.post('/api/transcriptions/:id/summary', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      if (!transcription.text) {
        return res.status(400).json({ message: "Transcription has no text content" });
      }
      
      // Generate summary using OpenAI
      const result = await generateTranscriptSummary(transcription.text);
      
      // Process the summary to ensure it doesn't contain any markdown formatting
      const cleanSummary = result.summary.replace(/\*\*/g, '');
      
      // Format action items as a newline-separated string instead of JSON
      const actionItemsText = result.actionItems?.length 
        ? result.actionItems.join('\n') 
        : null;
      
      // Update the transcription with the summary and action items
      const updatedTranscription = await storage.updateTranscription(id, {
        summary: cleanSummary,
        actionItems: actionItemsText,
        keywords: result.keywords.join(', '),
        updatedAt: new Date(),
      });
      
      return res.status(200).json({
        summary: cleanSummary,
        actionItems: result.actionItems || [],
        keywords: result.keywords,
        transcription: updatedTranscription
      });
    } catch (error) {
      console.error("Error generating summary:", error);
      return res.status(500).json({ message: "Error generating summary" });
    }
  });
  
  // Translate a transcription
  app.post('/api/transcriptions/:id/translate', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const { targetLanguage } = req.body;
      if (!targetLanguage || typeof targetLanguage !== 'string') {
        return res.status(400).json({ message: "Target language is required" });
      }
      
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      if (!transcription.text) {
        return res.status(400).json({ message: "Transcription has no text content" });
      }
      
      // Translate the transcription
      const result = await translateTranscript(transcription.text, targetLanguage);
      
      // Update the transcription with the translated text
      const updatedTranscription = await storage.updateTranscription(id, {
        translatedText: result.translatedText,
        updatedAt: new Date(),
      });
      
      return res.status(200).json({
        translatedText: result.translatedText,
        transcription: updatedTranscription
      });
    } catch (error) {
      console.error("Error translating transcription:", error);
      return res.status(500).json({ message: "Error translating transcription" });
    }
  });
  
  // Download a transcription as PDF
  app.get('/api/transcriptions/:id/pdf', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      if (!transcription.text) {
        return res.status(400).json({ message: "Transcription has no text content" });
      }
      
      // Try to parse structured transcript from text if speakerLabels is true
      let structuredTranscript = undefined;
      
      // Try to detect if we're dealing with structured content
      const hasStructuredContent = transcription.text && (
        transcription.text.includes('[') && 
        transcription.text.includes(']:') || 
        transcription.text.includes('Speaker') ||
        transcription.text.match(/\[\d+:\d+\]/)
      );
      
      if (hasStructuredContent || transcription.speakerLabels || transcription.hasTimestamps) {
        try {
          // First try matching timestamps with speaker labels
          // Format: [00:00] Speaker 1: This is what they said
          let segments = transcription.text.match(/\[([0-9:]+)\]\s*(?:([^:]+):\s*)?(.+?)(?=\n\[|$)/g);
          
          // If no segments found with the above pattern, try another common format
          // Format: Speaker 1 [00:00]: This is what they said
          if (!segments || segments.length === 0) {
            segments = transcription.text.match(/([^[]+)\s*\[([0-9:]+)\]:\s*(.+?)(?=\n[^[]+\s*\[|$)/g);
          }
          
          if (segments && segments.length > 0) {
            structuredTranscript = {
              segments: segments.map(segment => {
                let timeMatch, speakerMatch, textMatch, startTime;
                
                // Try first format: [00:00] Speaker: Text
                if (segment.match(/^\[([0-9:]+)\]/)) {
                  timeMatch = segment.match(/\[([0-9:]+)\]/);
                  speakerMatch = segment.match(/\[[0-9:]+\]\s*([^:]+):/);
                  textMatch = segment.match(/\[[0-9:]+\]\s*(?:[^:]+:\s*)?(.+)/);
                  
                  const time = timeMatch ? timeMatch[1] : "00:00";
                  // Convert MM:SS to seconds
                  const [minutes, seconds] = time.split(':').map(Number);
                  startTime = minutes * 60 + seconds;
                } 
                // Try second format: Speaker [00:00]: Text
                else if (segment.match(/[^[]+\s*\[([0-9:]+)\]:/)) {
                  timeMatch = segment.match(/\[([0-9:]+)\]/);
                  speakerMatch = segment.match(/^([^[]+)\s*\[[0-9:]+\]:/);
                  textMatch = segment.match(/[^[]+\s*\[[0-9:]+\]:\s*(.+)/);
                  
                  const time = timeMatch ? timeMatch[1] : "00:00";
                  // Convert MM:SS to seconds
                  const [minutes, seconds] = time.split(':').map(Number);
                  startTime = minutes * 60 + seconds;
                }
                
                const speaker = speakerMatch ? speakerMatch[1].trim() : undefined;
                const text = textMatch ? textMatch[1].trim() : segment;
                
                return {
                  start: startTime || 0,
                  end: (startTime || 0) + 10, // Approximate 10-second segments
                  text,
                  speaker
                };
              }),
              metadata: {
                speakerCount: transcription.speakerCount || undefined,
                duration: transcription.duration || undefined,
                language: transcription.language || undefined
              }
            };
          }
        } catch (parseError) {
          console.error("Error parsing structured transcript:", parseError);
          // Continue without structured format if parsing fails
        }
      }
      
      // Generate PDF
      const { filePath, fileName } = await generateTranscriptPDF(transcription, structuredTranscript);
      
      // Send the PDF file
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`Error deleting temporary PDF file: ${err?.message || 'Unknown error'}`);
        });
      });
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      return res.status(500).json({ message: "Error generating PDF" });
    }
  });

  // Get transcription audio file
  app.get('/api/transcriptions/:id/audio', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }

      // Check if transcription exists
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }

      // Get the audio file path
      const audioFilePath = await storage.getAudioFilePath(id);
      if (!audioFilePath) {
        return res.status(404).json({ message: "Audio file not found" });
      }

      // Set content type based on file extension
      const ext = path.extname(audioFilePath).toLowerCase();
      let contentType = 'audio/mpeg';
      if (ext === '.wav') {
        contentType = 'audio/wav';
      } else if (ext === '.m4a') {
        contentType = 'audio/mp4';
      }

      // Stream the audio file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${transcription.fileName}"`);
      const fileStream = fs.createReadStream(audioFilePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error serving audio file:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Batch process multiple files
  app.post('/api/batch-transcribe', upload.array('files', 10), async (req: Request, res: Response) => {
    try {
      // Validate files
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      
      // Extract common options for all files
      const enableSpeakerLabels = req.body.enableSpeakerLabels === 'true' || req.body.enableSpeakerLabels === true;
      const enableTimestamps = req.body.enableTimestamps === 'true' || req.body.enableTimestamps === true;
      const language = req.body.language || null;
      const generateSummary = req.body.generateSummary === 'true' || req.body.generateSummary === true;
      
      // Process each file
      const transcriptionIds: number[] = [];
      const files = req.files as Express.Multer.File[];
      
      for (const file of files) {
        try {
          // Create transcription record for this file
          const transcription = await storage.createTranscription({
            fileName: file.originalname,
            fileSize: file.size,
            fileType: path.extname(file.originalname).substring(1),
            status: "queued", // Use "queued" status for batch processing
            meetingTitle: file.originalname.replace(/\.[^/.]+$/, ""), // Use filename as meeting title
            meetingDate: new Date(),
            participants: null,
            speakerLabels: enableSpeakerLabels,
            hasTimestamps: enableTimestamps,
            language,
          });
          
          transcriptionIds.push(transcription.id);
        } catch (error) {
          console.error(`Error creating transcription record for ${file.originalname}:`, error);
          // Continue with other files
        }
      }
      
      // Start processing in background (we'll process one file at a time)
      if (transcriptionIds.length > 0) {
        (async () => {
          for (const id of transcriptionIds) {
            try {
              // Get transcription record and file
              const transcription = await storage.getTranscription(id);
              if (!transcription) continue;
              
              // Find the corresponding file
              const file = files.find(f => f.originalname === transcription.fileName);
              if (!file) continue;
              
              // Update status to processing
              await storage.updateTranscription(id, {
                status: "processing",
                updatedAt: new Date(),
              });
              
              // Use the enhanced transcription if advanced features are enabled
              if (enableSpeakerLabels || enableTimestamps) {
                const result = await transcribeAudioWithFeatures(file.path, {
                  enableSpeakerDiarization: enableSpeakerLabels,
                  enableTimestamps: enableTimestamps,
                  language: language || undefined,
                });
                
                // Format the transcript text with speaker labels if speaker diarization is enabled
                let formattedText = result.text;
                if (enableSpeakerLabels && result.structuredTranscript.segments.length > 0) {
                  // Ensure consistent speaker formatting with clear line breaks between speakers
                  formattedText = result.structuredTranscript.segments.map(segment => {
                    const timeStr = enableTimestamps ? `[${formatTime(segment.start)}] ` : '';
                    const speakerStr = segment.speaker ? `${segment.speaker}: ` : '';
                    return `${timeStr}${speakerStr}${segment.text}`;
                  }).join('\n\n');
                }
                
                // Generate a summary if requested
                let summary = null;
                let keywords = null;
                let actionItems = null;
                
                if (generateSummary && result.text) {
                  try {
                    // Apply threshold checks
                    const wordCount = result.text.split(/\s+/).filter(Boolean).length;
                    const lineCount = result.text.split('\n').filter(line => line.trim().length > 0).length;
                    
                    // Only generate summaries for substantial content (relaxed thresholds)
                    if (result.text.length >= 100 && wordCount >= 15) { // Reduced thresholds
                      const summaryResult = await generateTranscriptSummary(result.text);
                      summary = summaryResult.summary;
                      actionItems = summaryResult.actionItems?.length 
                        ? summaryResult.actionItems.join('\n') 
                        : null;
                      keywords = summaryResult.keywords.join(', ');
                    } else {
                      // For short content, use a standard message
                      summary = "The transcript is too brief for a meaningful summary.";
                    }
                  } catch (summaryError) {
                    console.error("Error generating summary:", summaryError);
                  }
                }
                
                // Update the transcription record with enhanced data
                await storage.updateTranscription(id, {
                  text: formattedText,
                  status: "completed",
                  updatedAt: new Date(),
                  speakerCount: result.structuredTranscript.metadata?.speakerCount || null,
                  duration: result.duration || null,
                  language: result.language || null,
                  summary,
                  keywords,
                  actionItems,
                  speakerLabels: enableSpeakerLabels && result.structuredTranscript.segments.some(s => s.speaker),
                  hasTimestamps: enableTimestamps,
                  // Store structured transcript as JSON string
                  structuredTranscript: JSON.stringify(result.structuredTranscript) 
                });
              } else {
                // Use basic transcription for simple cases
                const result = await transcribeAudio(file.path);
                
                // Update the transcription record
                await storage.updateTranscription(id, {
                  text: result.text,
                  status: "completed",
                  updatedAt: new Date(),
                  duration: result.duration || null,
                  language: result.language || null,
                  speakerLabels: false,
                  hasTimestamps: false,
                  // Store null for structured transcript when using basic transcription
                  structuredTranscript: null 
                });
              }
              
              // Clean up the file
              fs.unlink(file.path, (err) => {
                if (err) console.error(`Error deleting file: ${err?.message || 'Unknown error'}`);
              });
              
            } catch (processError) {
              // Handle errors for this file (Original simpler error handling)
              const errorMessage = processError instanceof Error ? processError.message : String(processError);
              console.error(`Error processing transcription ${id}:`, errorMessage);
              await storage.updateTranscription(id, {
                error: errorMessage,
                status: "error",
                updatedAt: new Date(),
                 // Ensure structuredTranscript is null on error
                structuredTranscript: null
              });
              
              // Clean up the file (Original path)
              // Need to find the correct file path for cleanup in case of error
              const failedTranscription = await storage.getTranscription(id);
              const fileToClean = files.find(f => f.originalname === failedTranscription?.fileName);
              if (fileToClean) {
                fs.unlink(fileToClean.path, (err) => { 
                  if (err) console.error(`Error deleting batch file ${fileToClean.originalname} after error: ${err?.message || 'Unknown error'}`);
                });
              } else {
                 console.warn(`Could not find file path to clean for failed transcription ID ${id}`);
              }
            }
          } // End loop for batch IDs
        })();
      }
      
      // Return the transcription IDs
      return res.status(202).json({
        message: `Batch processing started for ${transcriptionIds.length} files`,
        transcriptionIds,
      });
      
    } catch (error) {
      console.error("Error handling batch transcription:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
