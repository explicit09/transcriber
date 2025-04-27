import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertTranscriptionSchema, 
  audioFileSchema, 
  structuredTranscriptSchema, 
  StructuredTranscript,
  TranscriptSegment 
} from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { 
  transcribeAudio, 
  transcribeAudioWithFeatures,
  transcribeWithPyannote,
  generateTranscriptSummary, 
  translateTranscript,
  autoMergeSpeakers
} from "./openai";
import { transcribeWithAssemblyAI, formatTranscriptText } from "./assemblyai";
import { generateTranscriptPDF } from "./pdf";
import { z } from "zod";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { checkDiarizationSetup } from "./diarization";

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

// Helper function to format seconds into readable time
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Check if advanced diarization methods are available
let isPyannoteDiarizationAvailable = false;
let isAssemblyAIAvailable = false;

// This will be called at server startup
async function checkDiarizationAvailability() {
  try {
    // Check if pyannote is available
    isPyannoteDiarizationAvailable = await checkDiarizationSetup();
    console.log(`Pyannote.audio diarization is ${isPyannoteDiarizationAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    
    if (!isPyannoteDiarizationAvailable) {
      console.log('For multi-speaker transcription with Pyannote, please install pyannote.audio:');
      console.log('1. cd python');
      console.log('2. pip install -r requirements.txt');
      console.log('3. Get a HuggingFace token with access to pyannote/speaker-diarization-3.0');
      console.log('4. Set HUGGINGFACE_TOKEN environment variable');
    }
    
    // Check if AssemblyAI is available
    isAssemblyAIAvailable = !!process.env.ASSEMBLYAI_API_KEY;
    console.log(`AssemblyAI diarization is ${isAssemblyAIAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    
    if (!isAssemblyAIAvailable) {
      console.log('For multi-speaker transcription with AssemblyAI, please set the ASSEMBLYAI_API_KEY environment variable');
    }
  } catch (error) {
    console.error('Error checking diarization availability:', error);
    isPyannoteDiarizationAvailable = false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Check for pyannote diarization availability at startup
  await checkDiarizationAvailability();
  
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
      const numSpeakers = req.body.numSpeakers ? parseInt(req.body.numSpeakers) : null;
      
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
          // Transcribe the audio file
          const filePath = file.path;
          
          // Determine which transcription method to use based on available services
          const useAssemblyAI = isAssemblyAIAvailable && enableSpeakerLabels;
          const usePyannote = !useAssemblyAI && isPyannoteDiarizationAvailable && enableSpeakerLabels;
          
          // Calculate expected speaker count
          const expectedSpeakers = numSpeakers || (participants ? participants.split(',').length : undefined);
          
          let result;
          if (useAssemblyAI) {
            console.log("Using AssemblyAI for advanced speaker diarization");
            result = await transcribeWithAssemblyAI(filePath, {
              speakerLabels: enableSpeakerLabels,
              numSpeakers: expectedSpeakers,
              language: language || undefined
            });
          } else if (usePyannote) {
            console.log("Using pyannote.audio for advanced speaker diarization");
            result = await transcribeWithPyannote(filePath, {
              enableTimestamps: enableTimestamps,
              language: language || undefined,
              numSpeakers: expectedSpeakers
            });
          } else {
            console.log("Using standard OpenAI transcription" + (enableSpeakerLabels ? " with text-based speaker detection" : ""));
            result = await transcribeAudioWithFeatures(filePath, {
              enableTimestamps: enableTimestamps,
              language: language || undefined,
            });
          }
          
          // Format the transcript text with speaker labels if speaker diarization is enabled
          let formattedText = result.text;
          if (enableSpeakerLabels && result.structuredTranscript.segments.length > 0) {
            // Log what we're using to format
            console.log(`Formatting transcript with ${result.structuredTranscript.segments.length} segments and ${result.structuredTranscript.metadata?.speakerCount || 0} speakers`);
            
            // Group segments by speaker for cleaner output
            let currentSpeaker = '';
            let currentSegmentStart = 0;
            let currentTexts: string[] = [];
            let formattedSegments: string[] = [];
            
            result.structuredTranscript.segments.forEach(segment => {
              const speaker = segment.speaker || 'Unknown Speaker';
              
              // If this is the same speaker as before, just accumulate the text
              if (speaker === currentSpeaker) {
                currentTexts.push(segment.text);
              } else {
                // If we have accumulated text for a previous speaker, add it to our output
                if (currentTexts.length > 0) {
                  const timePrefix = enableTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
                  formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
                }
                
                // Start a new speaker group
                currentSpeaker = speaker;
                currentSegmentStart = segment.start;
                currentTexts = [segment.text];
              }
            });
            
            // Don't forget the last group
            if (currentTexts.length > 0) {
              const timePrefix = enableTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
              formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
            }
            
            formattedText = formattedSegments.join('\n\n');
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
        console.log(`Parsing structuredTranscript for ID ${id}, speakerLabels: ${transcription.speakerLabels}, speakerCount: ${transcription.speakerCount}`);
        
        try {
          structuredTranscript = JSON.parse(transcription.structuredTranscript);
          
          // Ensure all speakers are properly counted and preserved
          if (structuredTranscript.segments && structuredTranscript.segments.length > 0) {
            // Get unique speakers from segments
            const speakerSet = new Set<string>();
            structuredTranscript.segments.forEach((segment: any) => {
              if (segment.speaker) {
                speakerSet.add(segment.speaker);
              }
            });
            
            // Count actual speakers in the transcript
            const actualSpeakerCount = speakerSet.size;
            
            // Update metadata to reflect actual speaker count
            if (structuredTranscript.metadata) {
              structuredTranscript.metadata.speakerCount = actualSpeakerCount;
            } else {
              structuredTranscript.metadata = {
                speakerCount: actualSpeakerCount,
                duration: transcription.duration || 0
              };
            }
            
            console.log("Successfully parsed structuredTranscript:", 
              JSON.stringify({
                speakerCount: actualSpeakerCount,
                detectedSpeakers: Array.from(speakerSet).join(', '),
                segmentsCount: structuredTranscript.segments.length,
                hasSpeakers: structuredTranscript.segments.some((s: any) => s.speaker),
                firstSegment: structuredTranscript.segments[0] ? {
                  start: structuredTranscript.segments[0].start,
                  end: structuredTranscript.segments[0].end,
                  hasSpeaker: !!structuredTranscript.segments[0].speaker,
                  speaker: structuredTranscript.segments[0].speaker
                } : null
              })
            );
            
            // Update transcription object's speaker count to match actual speakers
            transcription.speakerCount = actualSpeakerCount;
          } else {
            console.log("Structured transcript has no segments or empty segments array");
          }
        } catch (e) {
          console.error("Failed to parse structuredTranscript JSON:", e);
          console.error("Raw structuredTranscript data:", transcription.structuredTranscript.substring(0, 200) + "...");
          // Try to recover by creating a basic structure
          structuredTranscript = {
            segments: [],
            metadata: { speakerCount: transcription.speakerCount || 0, duration: transcription.duration || 0 }
          };
        }
      } else {
        console.log(`No structuredTranscript for ID ${id}, speakerLabels: ${transcription.speakerLabels}`);
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
            
            // Ensure speaker counts are accurate
            if (structuredTranscript && structuredTranscript.segments && structuredTranscript.segments.length > 0) {
              // Count unique speakers in segments
              const speakerSet = new Set<string>();
              structuredTranscript.segments.forEach((segment: any) => {
                if (segment.speaker) {
                  speakerSet.add(segment.speaker);
                }
              });
              
              // Update metadata to match actual speaker count
              const actualSpeakerCount = speakerSet.size;
              if (structuredTranscript.metadata) {
                structuredTranscript.metadata.speakerCount = actualSpeakerCount;
              }
              
              // Update transcription object's speaker count
              t.speakerCount = actualSpeakerCount;
            }
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
  
  // Update speaker labels in a transcription
  app.patch('/api/transcriptions/:id/speakers', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const { speakerMappings } = req.body;
      if (!speakerMappings || typeof speakerMappings !== 'object') {
        return res.status(400).json({ message: "Speaker mappings are required" });
      }
      
      // Get current transcription
      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      // Parse structured transcript
      if (!transcription.structuredTranscript) {
        return res.status(400).json({ message: "No structured transcript available" });
      }
      
      let structuredData;
      try {
        structuredData = typeof transcription.structuredTranscript === 'string' 
          ? JSON.parse(transcription.structuredTranscript)
          : transcription.structuredTranscript;
      } catch (e) {
        return res.status(400).json({ message: "Invalid structured transcript format" });
      }
      
      // Update speaker labels in segments
      if (structuredData.segments && Array.isArray(structuredData.segments)) {
        structuredData.segments = structuredData.segments.map((segment: any) => {
          if (segment.speaker && speakerMappings[segment.speaker]) {
            return {
              ...segment,
              speaker: speakerMappings[segment.speaker]
            };
          }
          return segment;
        });
        
        // Also update any text that contains speaker labels if needed
        let updatedText = transcription.text || '';
        if (updatedText) {
          Object.entries(speakerMappings).forEach(([originalName, newName]) => {
            const regex = new RegExp(`\\b${originalName}\\b`, 'g');
            updatedText = updatedText.replace(regex, newName as string);
          });
        }
        
        // Update the transcription with new structured data and optionally text
        const updates: any = {
          structuredTranscript: JSON.stringify(structuredData),
          updatedAt: new Date()
        };
        
        if (updatedText !== transcription.text) {
          updates.text = updatedText;
        }
        
        const updated = await storage.updateTranscription(id, updates);
        if (!updated) {
          return res.status(404).json({ message: "Failed to update transcription" });
        }
        
        // Return the updated transcription with parsed structuredTranscript
        return res.status(200).json({
          ...updated,
          structuredTranscript: structuredData
        });
      } else {
        return res.status(400).json({ message: "No segments found in structured transcript" });
      }
    } catch (error) {
      console.error("Error updating speaker labels:", error);
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
      const cleanSummary = result.summary ? result.summary.replace(/\*\*/g, '') : "No summary could be generated.";
      
      // Format action items as a newline-separated string instead of JSON
      const actionItemsText = Array.isArray(result.actionItems) && result.actionItems.length > 0
        ? result.actionItems.join('\n') 
        : null;
        
      // Format keywords
      const keywordsText = Array.isArray(result.keywords) && result.keywords.length > 0
        ? result.keywords.join(', ')
        : null;
      
      // Update the transcription with the summary and action items
      const updatedTranscription = await storage.updateTranscription(id, {
        summary: cleanSummary,
        actionItems: actionItemsText,
        keywords: keywordsText,
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
      const numSpeakers = req.body.numSpeakers ? parseInt(req.body.numSpeakers) : null;
      
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
              
              // Determine if we should use advanced diarization
              const usePyannote = isPyannoteDiarizationAvailable && enableSpeakerLabels;
              
              if (enableSpeakerLabels || enableTimestamps) {
                console.log("Using enhanced transcription" + (usePyannote ? " with pyannote diarization" : ""));
                
                // Determine which transcription method to use
                const transcriptionMethod = usePyannote ? transcribeWithPyannote : transcribeAudioWithFeatures;
                
                // Call the appropriate method
                const result = await transcriptionMethod(file.path, {
                  enableTimestamps: enableTimestamps,
                  language: language || undefined,
                  numSpeakers: numSpeakers || (transcription.participants ? transcription.participants.split(',').length : undefined)
                });
                
                // Format the transcript text with speaker labels if speaker diarization is enabled
                let formattedText = result.text;
                if (enableSpeakerLabels && result.structuredTranscript.segments.length > 0) {
                  // Log what we're using to format
                  console.log(`Formatting transcript with ${result.structuredTranscript.segments.length} segments and ${result.structuredTranscript.metadata?.speakerCount || 0} speakers`);
                  
                  // Group segments by speaker for cleaner output
                  let currentSpeaker = '';
                  let currentSegmentStart = 0;
                  let currentTexts: string[] = [];
                  let formattedSegments: string[] = [];
                  
                  result.structuredTranscript.segments.forEach(segment => {
                    const speaker = segment.speaker || 'Unknown Speaker';
                    
                    // If this is the same speaker as before, just accumulate the text
                    if (speaker === currentSpeaker) {
                      currentTexts.push(segment.text);
                    } else {
                      // If we have accumulated text for a previous speaker, add it to our output
                      if (currentTexts.length > 0) {
                        const timePrefix = enableTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
                        formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
                      }
                      
                      // Start a new speaker group
                      currentSpeaker = speaker;
                      currentSegmentStart = segment.start;
                      currentTexts = [segment.text];
                    }
                  });
                  
                  // Don't forget the last group
                  if (currentTexts.length > 0) {
                    const timePrefix = enableTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
                    formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
                  }
                  
                  formattedText = formattedSegments.join('\n\n');
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

  // Auto-merge speakers in a transcription
  app.post('/api/transcriptions/:id/merge-speakers', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid transcription ID" });
      }
      
      const { targetSpeakerCount } = req.body;
      if (!targetSpeakerCount || isNaN(parseInt(targetSpeakerCount))) {
        return res.status(400).json({ message: "targetSpeakerCount is required and must be a number" });
      }

      const transcription = await storage.getTranscription(id);
      if (!transcription) {
        return res.status(404).json({ message: "Transcription not found" });
      }
      
      if (!transcription.structuredTranscript) {
        return res.status(400).json({ 
          message: "This transcription doesn't have structured data with speaker information" 
        });
      }
      
      let structuredTranscript: StructuredTranscript;
      try {
        structuredTranscript = JSON.parse(transcription.structuredTranscript);
      } catch (e) {
        return res.status(500).json({ message: "Failed to parse structured transcript data" });
      }
      
      const target = parseInt(targetSpeakerCount);
      
      // Apply auto-merge algorithm
      const mergedSegments = autoMergeSpeakers(structuredTranscript.segments, target);
      
      // Count actual speakers after merging
      const speakerSet = new Set<string>();
      mergedSegments.forEach(segment => {
        if (segment.speaker) {
          speakerSet.add(segment.speaker);
        }
      });
      const actualSpeakerCount = speakerSet.size;
      
      console.log(`After merging: requested ${target} speakers, found ${actualSpeakerCount} speakers: ${Array.from(speakerSet).join(', ')}`);
      
      // Create updated transcript structure
      const updatedStructuredTranscript: StructuredTranscript = {
        segments: mergedSegments,
        metadata: {
          ...structuredTranscript.metadata,
          speakerCount: actualSpeakerCount // Use actual count, not target
        }
      };
      
      // Format the transcript text with speaker labels
      let formattedText = '';
      if (mergedSegments.length > 0) {
        // Group segments by speaker for cleaner output
        let currentSpeaker = '';
        let currentSegmentStart = 0;
        let currentTexts: string[] = [];
        let formattedSegments: string[] = [];
        
        mergedSegments.forEach(segment => {
          const speaker = segment.speaker || 'Unknown Speaker';
          
          // If this is the same speaker as before, just accumulate the text
          if (speaker === currentSpeaker) {
            currentTexts.push(segment.text);
          } else {
            // If we have accumulated text for a previous speaker, add it to our output
            if (currentTexts.length > 0) {
              const timePrefix = transcription.hasTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
              formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
            }
            
            // Start a new speaker group
            currentSpeaker = speaker;
            currentSegmentStart = segment.start;
            currentTexts = [segment.text];
          }
        });
        
        // Don't forget the last group
        if (currentTexts.length > 0) {
          const timePrefix = transcription.hasTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
          formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
        }
        
        formattedText = formattedSegments.join('\n\n');
      }
      
      // Update the transcription with the merged data
      const updatedTranscription = await storage.updateTranscription(id, {
        text: formattedText,
        updatedAt: new Date(),
        speakerCount: actualSpeakerCount, // Use actual count, not target
        structuredTranscript: JSON.stringify(updatedStructuredTranscript)
      });
      
      // Return the updated transcription with parsed structured data
      return res.status(200).json({
        ...updatedTranscription,
        structuredTranscript: updatedStructuredTranscript
      });
    } catch (error) {
      console.error("Error merging speakers:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get speaker similarity data for a transcription
  app.get('/api/transcriptions/:id/speaker-similarity', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Transcription ID is required' });
      }
      
      // Get the transcription
      const transcription = await storage.getTranscription(id);
      
      if (!transcription) {
        return res.status(404).json({ error: 'Transcription not found' });
      }
      
      // Check if we have a structured transcript
      if (!transcription.structuredTranscript) {
        return res.status(400).json({ error: 'No structured transcript available to analyze' });
      }
      
      // Parse the structured transcript
      let segments;
      try {
        segments = JSON.parse(transcription.structuredTranscript) as TranscriptSegment[];
      } catch (error) {
        return res.status(500).json({ error: 'Failed to parse structured transcript' });
      }
      
      // Get all unique speakers
      const speakers = new Set<string>();
      for (const segment of segments) {
        if (segment.speaker) {
          speakers.add(segment.speaker);
        }
      }
      
      const speakerArray = Array.from(speakers);
      
      // Calculate statistics for each speaker
      interface SpeakerStats {
        totalWords: number;
        averageWordsPerSegment: number;
        segmentCount: number;
        totalDuration: number;
        averageDuration: number;
        wordFrequencies: Record<string, number>;
        topWords: {word: string, count: number}[];
      }
      
      const speakerStats: Record<string, SpeakerStats> = {};
      
      for (const speaker of speakerArray) {
        const speakerSegments = segments.filter(s => s.speaker === speaker);
        
        const totalWords = speakerSegments.reduce((sum, segment) => {
          return sum + (segment.text.split(/\s+/).filter(Boolean).length);
        }, 0);
        
        const totalDuration = speakerSegments.reduce((sum, segment) => {
          return sum + ((segment.end || 0) - (segment.start || 0));
        }, 0);
        
        // Calculate word frequencies (simple bag of words)
        const wordFrequencies: Record<string, number> = {};
        for (const segment of speakerSegments) {
          const words = segment.text.toLowerCase()
            .replace(/[,.?!:;()\[\]{}'"]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 2); // Filter out short words
          
          for (const word of words) {
            wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
          }
        }
        
        // Get top words for this speaker
        const topWords = Object.entries(wordFrequencies)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([word, count]) => ({ word, count }));
        
        speakerStats[speaker] = {
          totalWords,
          averageWordsPerSegment: totalWords / speakerSegments.length,
          segmentCount: speakerSegments.length,
          totalDuration,
          averageDuration: totalDuration / speakerSegments.length,
          wordFrequencies,
          topWords
        };
      }
      
      // Calculate similarity between speakers
      interface SpeakerPair {
        speaker1: string;
        speaker2: string;
        similarity: number;
        vocabularySimilarity: number;
        durationSimilarity: number;
        wordsSimilarity: number;
      }
      
      const speakerPairs: SpeakerPair[] = [];
      
      for (let i = 0; i < speakerArray.length; i++) {
        for (let j = i + 1; j < speakerArray.length; j++) {
          const speaker1 = speakerArray[i];
          const speaker2 = speakerArray[j];
          const stats1 = speakerStats[speaker1];
          const stats2 = speakerStats[speaker2];
          
          // Calculate jaccard similarity of word usage
          const words1 = Object.keys(stats1.wordFrequencies);
          const words2 = Object.keys(stats2.wordFrequencies);
          const commonWords = words1.filter(word => words2.includes(word));
          const vocabularySimilarity = commonWords.length / (words1.length + words2.length - commonWords.length);
          
          // Calculate similarity in speaking style metrics
          const durationSimilarity = 1 - Math.abs(stats1.averageDuration - stats2.averageDuration) / 
                                    Math.max(stats1.averageDuration, stats2.averageDuration);
          
          const wordsSimilarity = 1 - Math.abs(stats1.averageWordsPerSegment - stats2.averageWordsPerSegment) /
                                  Math.max(stats1.averageWordsPerSegment, stats2.averageWordsPerSegment);
          
          // Calculate a weighted similarity score
          const similarity = (
            vocabularySimilarity * 0.6 + 
            durationSimilarity * 0.2 + 
            wordsSimilarity * 0.2
          );
          
          speakerPairs.push({
            speaker1,
            speaker2,
            similarity,
            vocabularySimilarity,
            durationSimilarity,
            wordsSimilarity
          });
        }
      }
      
      // Sort by similarity (highest first)
      speakerPairs.sort((a, b) => b.similarity - a.similarity);
      
      // Return speaker stats and similarity data
      return res.json({
        speakers: speakerArray,
        speakerStats,
        speakerPairs: speakerPairs.map(pair => ({
          ...pair,
          similarity: Math.round(pair.similarity * 100) / 100,
          vocabularySimilarity: Math.round(pair.vocabularySimilarity * 100) / 100,
          durationSimilarity: Math.round(pair.durationSimilarity * 100) / 100,
          wordsSimilarity: Math.round(pair.wordsSimilarity * 100) / 100
        })),
        currentSpeakerCount: speakers.size
      });
    } catch (error) {
      console.error('Error analyzing speaker similarity:', error);
      return res.status(500).json({ error: 'Failed to analyze speaker similarity' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
