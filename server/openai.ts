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

IMPORTANT INSTRUCTION: DEFAULT TO TWO SPEAKERS UNLESS THERE IS OVERWHELMING EVIDENCE OTHERWISE.

IMPROVED SPEAKER ANALYSIS APPROACH:
1. First, read the entire transcript to understand the overall flow, topics, and speaking styles
2. For most conversations, assume 2 speakers unless there is CLEAR evidence of 3+ distinct voices
3. Be CONSERVATIVE with speaker assignments - prefer fewer speakers rather than more
4. Never infer a third speaker based on minor changes in speaking style or topic
5. Only assign a third speaker if there are explicit references to another person speaking

ACCURACY GUIDELINES:
- For normal dialogues, default to 2 speakers (Speaker 1 and Speaker 2) ONLY
- Use Speaker 3 ONLY if there is EXPLICIT evidence someone else is speaking
- A slight change in tone, formality, or topic is NOT evidence of a different speaker
- Question-and-answer exchanges are almost always between the same two speakers
- In two-person conversations, speakers often change topics, tone, and style - this doesn't mean a third person joined

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

    // Parse the JSON response
    const result = JSON.parse(content);
    
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
  // Always enforce 2 speakers unless there's overwhelming evidence
  if (result.speakerCount > 2) {
    console.log(`Consolidating speakers: Initial count ${result.speakerCount}, enforcing 2.`);
    
    // Create a map of speaker patterns to help identify consistent speakers
    const speakerPatterns = new Map<string, { 
      count: number,
      avgPosition: number,
      commonPhrases: Set<string>
    }>();
    
    // First pass: gather speaker statistics
    result.segments.forEach((segment, index) => {
      const speaker = segment.speaker || '';
      if (!speakerPatterns.has(speaker)) {
        speakerPatterns.set(speaker, {
          count: 0,
          avgPosition: 0,
          commonPhrases: new Set()
        });
      }
      
      const pattern = speakerPatterns.get(speaker)!;
      pattern.count++;
      pattern.avgPosition += index;
      // Add common words or phrases to help identify speakers
      segment.text.toLowerCase()
        .split(/[.!?]\s+/)
        .forEach(phrase => pattern.commonPhrases.add(phrase.trim()));
    });
    
    // Calculate final averages
    speakerPatterns.forEach(pattern => {
      pattern.avgPosition /= pattern.count;
    });
    
    // Sort speakers by frequency and consistency
    const sortedSpeakers = Array.from(speakerPatterns.entries())
      .sort((a, b) => b[1].count - a[1].count);
    
    // Keep only the two most frequent speakers
    const primarySpeakers = sortedSpeakers.slice(0, 2).map(([speaker]) => speaker);
    
    // Create mapping for other speakers to the closest primary speaker
    const speakerMap = new Map<string, string>();
    sortedSpeakers.slice(2).forEach(([speaker, pattern]) => {
      // Find the closest primary speaker based on pattern similarity
      const closestPrimary = primarySpeakers.reduce((best, primary) => {
        const primaryPattern = speakerPatterns.get(primary)!;
        const similarity = pattern.commonPhrases.size / 
          (pattern.commonPhrases.size + primaryPattern.commonPhrases.size);
        return similarity > best.similarity ? { speaker: primary, similarity } : best;
      }, { speaker: primarySpeakers[0], similarity: 0 });
      
      speakerMap.set(speaker, closestPrimary.speaker);
    });
    
    // Update segments with consolidated speakers
    result.segments = result.segments.map(segment => ({
      ...segment,
      speaker: speakerMap.get(segment.speaker || '') || segment.speaker
    }));
    
    // Update speaker count
    result.speakerCount = 2;
  }
  
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
