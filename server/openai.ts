import OpenAI from "openai";
import fs from "fs";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'default_key' 
});

// Basic audio transcription function
export async function transcribeAudio(audioFilePath: string): Promise<{ 
  text: string, 
  duration?: number,
  language?: string 
}> {
  try {
    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // Extract any duration information if available
    const duration = transcription.duration;
    
    return {
      text: transcription.text,
      duration,
      language: transcription.language,
    };
  } catch (error) {
    console.error("OpenAI Transcription Error:", error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

// Enhanced transcription with speaker diarization and timestamps
export async function transcribeAudioWithFeatures(
  audioFilePath: string, 
  options: { 
    enableSpeakerDiarization?: boolean,
    enableTimestamps?: boolean,
    language?: string
  } = {}
): Promise<{
  text: string,
  structuredTranscript: StructuredTranscript,
  duration?: number,
  language?: string
}> {
  try {
    // First get the basic transcription with timestamps
    const audioReadStream = fs.createReadStream(audioFilePath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: options.language,
    });

    // Extract segments with timestamps
    const segments: TranscriptSegment[] = (transcription.segments || []).map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      confidence: segment.confidence,
      speaker: undefined // Will be filled in if speaker diarization is enabled
    }));

    // If speaker diarization is requested, process with GPT-4o
    let speakerCount = 0;
    if (options.enableSpeakerDiarization && segments.length > 0) {
      const processedSegments = await processSpeakerDiarization(segments, transcription.text);
      segments.length = 0; // Clear the array
      segments.push(...processedSegments.segments);
      speakerCount = processedSegments.speakerCount;
    }

    // Create the structured transcript
    const structuredTranscript: StructuredTranscript = {
      segments,
      metadata: {
        speakerCount: speakerCount || undefined,
        duration: transcription.duration,
        language: transcription.language,
      }
    };

    return {
      text: transcription.text,
      structuredTranscript,
      duration: transcription.duration,
      language: transcription.language,
    };
  } catch (error) {
    console.error("Enhanced Transcription Error:", error);
    throw new Error(`Failed to transcribe audio with features: ${error.message}`);
  }
}

// Process speaker diarization using GPT-4o
async function processSpeakerDiarization(
  timestampedSegments: TranscriptSegment[],
  fullText: string
): Promise<{ segments: TranscriptSegment[], speakerCount: number }> {
  try {
    // Format the segments for GPT
    const segmentsText = timestampedSegments
      .map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`)
      .join('\n');

    // Ask GPT-4o to analyze and assign speakers
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing conversation transcripts and identifying different speakers. 
          Analyze the following transcript with timestamps and identify each speaker.
          Format your response as a JSON object with the following structure:
          {
            "speakerCount": number,
            "segments": [
              {
                "start": number,
                "end": number,
                "text": "string",
                "speaker": "Speaker 1"
              },
              ...
            ]
          }
          Number speakers consecutively (Speaker 1, Speaker 2, etc). Try to accurately detect speaker changes based on context, speech patterns, and conversation flow.`
        },
        {
          role: "user",
          content: `Here is the transcript with timestamps:\n\n${segmentsText}\n\nFull transcript for context:\n${fullText}`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      segments: result.segments,
      speakerCount: result.speakerCount
    };
  } catch (error) {
    console.error("Speaker Diarization Error:", error);
    // Return the original segments if diarization fails
    return { 
      segments: timestampedSegments,
      speakerCount: 0
    };
  }
}

// Generate transcript summary using GPT-4o
export async function generateTranscriptSummary(text: string): Promise<{ 
  summary: string;
  keywords: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Summarize the following meeting transcript concisely. Extract key points, 
          action items, decisions made, and important discussion topics. Also identify up to 10 
          important keywords or phrases. Format your response as a JSON object with the following structure:
          {
            "summary": "A concise summary of the meeting (max 300 words)",
            "keywords": ["keyword1", "keyword2", "etc"]
          }`
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the JSON response
    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      summary: result.summary,
      keywords: result.keywords || []
    };
  } catch (error) {
    console.error("Summary Generation Error:", error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// Translate transcript to another language
export async function translateTranscript(
  text: string, 
  targetLanguage: string
): Promise<{ translatedText: string }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Translate the following text accurately into ${targetLanguage}. 
          Maintain the meaning, tone, and context of the original text.`
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    return {
      translatedText: response.choices[0].message.content
    };
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error(`Failed to translate text: ${error.message}`);
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
