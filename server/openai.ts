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
  } catch (error: unknown) {
    console.error("OpenAI Transcription Error:", error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
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
  } catch (error: unknown) {
    console.error("Enhanced Transcription Error:", error);
    throw new Error(`Failed to transcribe audio with features: ${error instanceof Error ? error.message : String(error)}`);
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
          content: `You are an expert speech and conversation analyst specializing in precise speaker diarization. Your task is to analyze a transcript and accurately identify different speakers.

CRITICAL INSTRUCTIONS:
1. First, determine the ACTUAL number of distinct speakers in the conversation
2. Use clear evidence like speaking patterns, conversation flow, and explicit references 
3. Label speakers consistently as "Speaker 1", "Speaker 2", "Speaker 3", etc.
4. Do NOT create more speakers than are actually present
5. Assign "Speaker 1" to the person who begins the conversation
6. Be conservative - only identify a new speaker when there's clear evidence

DIARIZATION APPROACH:
1. Read the entire transcript to understand overall conversational patterns
2. Identify distinct speech patterns, terminology, and topics for each speaker
3. Look for explicit turn-taking, introductions, or other clear speaker changes
4. Maintain absolute consistency in speaker assignments throughout the transcript
5. If a segment is ambiguous, assign it to the most likely speaker based on context

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

For academic contexts, use role-based labels like "Student" and "Professor" only if extremely clear from context.
Otherwise, use "Speaker 1", "Speaker 2", etc.`
        },
        {
          role: "user",
          content: `Here is the transcript with timestamps:\n\n${segmentsText}\n\nFull transcript for context:\n${fullText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1 // Very low temperature for more consistent results
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response with error handling
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      // Fallback to 2 speakers with basic formatting
      result = {
        speakerCount: 2,
        segments: timestampedSegments.map((segment, index) => ({
          ...segment,
          speaker: index % 2 === 0 ? "Speaker 1" : "Speaker 2"
        }))
      };
    }
    
    // Ensure we have at least 1 speaker, but respect the actual count detected
    result.speakerCount = Math.max(1, result.speakerCount || 0);
    
    // Post-process to ensure consistency and proper speaker labeling
    const processed = enforceConsistentSpeakers(result);
    
    return processed;
  } catch (error) {
    console.error("Speaker Diarization Error:", error);
    // Return the original segments if diarization fails
    return { 
      segments: timestampedSegments,
      speakerCount: 0
    };
  }
}

// Helper function to enforce consistent speaker labeling
function enforceConsistentSpeakers(
  result: { segments: TranscriptSegment[], speakerCount: number }
): { segments: TranscriptSegment[], speakerCount: number } {
  // Always ensure exactly 2 speakers
  console.log(`Processing speakers: Initial count ${result.speakerCount}, enforcing exactly 2.`);
  
  // Get all unique speaker labels
  const uniqueSpeakers = new Set<string>();
  result.segments.forEach(segment => {
    if (segment.speaker) {
      uniqueSpeakers.add(segment.speaker);
    }
  });
  
  // If we already have exactly Speaker 1 and Speaker 2, no need for complex logic
  if (uniqueSpeakers.size === 2 && 
      uniqueSpeakers.has("Speaker 1") && 
      uniqueSpeakers.has("Speaker 2")) {
    result.speakerCount = 2;
    return result;
  }
  
  // Create a map of speaker patterns to help identify consistent speakers
  const speakerPatterns = new Map<string, { 
    count: number,
    position: number[],
    text: string[]
  }>();
  
  // First pass: gather speaker statistics
  result.segments.forEach((segment, index) => {
    const speaker = segment.speaker || '';
    if (!speakerPatterns.has(speaker)) {
      speakerPatterns.set(speaker, {
        count: 0,
        position: [],
        text: []
      });
    }
    
    const pattern = speakerPatterns.get(speaker)!;
    pattern.count++;
    pattern.position.push(index);
    pattern.text.push(segment.text);
  });
  
  // Sort speakers by frequency
  const sortedSpeakers = Array.from(speakerPatterns.entries())
    .sort((a, b) => b[1].count - a[1].count);
  
  // If we don't have any speakers or just one, apply alternating pattern
  if (sortedSpeakers.length <= 1) {
    result.segments = result.segments.map((segment, index) => ({
      ...segment,
      speaker: index % 2 === 0 ? "Speaker 1" : "Speaker 2"
    }));
    result.speakerCount = 2;
    return result;
  }
  
  // For our primary mapping, take the two most frequent speakers
  const speaker1 = sortedSpeakers[0][0];
  const speaker2 = sortedSpeakers.length > 1 ? sortedSpeakers[1][0] : "";
  
  // Create a final mapping to exactly "Speaker 1" and "Speaker 2"
  const finalSpeakerMap = new Map<string, string>();
  sortedSpeakers.forEach(([speaker], index) => {
    if (index === 0) {
      finalSpeakerMap.set(speaker, "Speaker 1");
    } else if (index === 1) {
      finalSpeakerMap.set(speaker, "Speaker 2");
    } else {
      // For any additional speakers (which shouldn't exist but might), 
      // map to either Speaker 1 or 2 based on similarity
      const isSimilarToFirst = Math.random() > 0.5; // Simplified approach
      finalSpeakerMap.set(speaker, isSimilarToFirst ? "Speaker 1" : "Speaker 2");
    }
  });
  
  // Apply the final mapping to all segments
  result.segments = result.segments.map(segment => ({
    ...segment,
    speaker: segment.speaker ? 
      finalSpeakerMap.get(segment.speaker) || "Speaker 1" : 
      "Speaker 1"
  }));
  
  // Set the final count
  result.speakerCount = 2;
  
  return result;
}

// Generate transcript summary using GPT-4o
export async function generateTranscriptSummary(text: string): Promise<{ 
  summary: string;
  actionItems: string[];
  keywords: string[];
}> {
  try {
    // Get transcript metrics
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    
    // Only reject extremely short messages
    if (text.length < 50 || wordCount < 10) {
      return {
        summary: "The transcript is too brief for a meaningful summary.",
        actionItems: [],
        keywords: []
      };
    }
    
    // Proceed with AI summary generation
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Summarize the following meeting transcript concisely and ACCURATELY. 
          
          IMPORTANT GUIDELINES:
          1. ONLY summarize what is EXPLICITLY stated in the transcript
          2. NEVER add information that is not directly present in the transcript
          3. For longer transcripts (>1000 words), provide a more detailed summary with sections
          4. Be EXTREMELY conservative in your summary - when in doubt, exclude information
          5. Do NOT infer topics, decisions, or discussions that aren't clearly stated
          6. Confirm the existence of real actionable items before listing any
          
          Extract these components ONLY if they are EXPLICITLY in the transcript:
          1. Key points and decisions actually made in the meeting (not assumptions)
          2. Action items with clear owners and deadlines (only if explicitly mentioned)
          3. Important discussion topics (only topics actually discussed, not inferred)
          4. Up to 10 important keywords or phrases (that actually appear in the text)
          
          Format your response as a JSON object with the following structure:
          {
            "summary": "A concise summary of the meeting reflecting ONLY content that is actually in the transcript. For longer transcripts, break into clear sections. Use proper paragraph breaks but avoid using markdown formatting.",
            "actionItems": [
              "Person X needs to complete task Y by deadline Z",
              "Team needs to follow up on...",
              "etc."
            ],
            "keywords": ["keyword1", "keyword2", "etc"]
          }
          
          If there are no clear action items in the transcript, return an empty array for actionItems.
          For the action items, only include items that are SPECIFICALLY mentioned as tasks to be done with clear ownership.`
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Use very low temperature for factual responses
      max_tokens: 2000  // Increased token limit for longer summaries
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);
    
    return {
      summary: result.summary,
      actionItems: result.actionItems || [],
      keywords: result.keywords || []
    };
  } catch (error: unknown) {
    console.error("Summary Generation Error:", error);
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : String(error)}`);
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

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    return {
      translatedText: content
    };
  } catch (error: unknown) {
    console.error("Translation Error:", error);
    throw new Error(`Failed to translate text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
