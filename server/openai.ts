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
      
    // Pre-analyze the transcript to determine if it's likely a two-person conversation
    const isLikelyTwoPerson = isProbablyTwoPersonConversation(fullText);

    // Ask GPT-4o to analyze and assign speakers
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert speech and conversation analyst specializing in precise speaker diarization. Your task is to analyze a transcript and accurately identify different speakers.

IMPORTANT INSTRUCTION: DEFAULT TO TWO SPEAKERS UNLESS THERE IS OVERWHELMING EVIDENCE OTHERWISE.

${isLikelyTwoPerson ? "⚠️ CRITICAL: This transcript appears to be a TWO-PERSON CONVERSATION. Unless there is explicit evidence of 3+ distinct speakers (such as self-introductions or explicit naming of a third person), you MUST use only 'Speaker 1' and 'Speaker 2'." : ""}

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
    const processed = enforceConsistentSpeakers(result, isLikelyTwoPerson);
    
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

// Helper function to check if a transcript is likely a two-person conversation
function isProbablyTwoPersonConversation(text: string): boolean {
  // Check for patterns that suggest a two-person conversation
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  // Check for alternating question-answer patterns (very common in two-person exchanges)
  let questionCount = 0;
  for (const line of lines) {
    if (line.includes('?')) {
      questionCount++;
    }
  }
  
  // If there are questions and it's a back-and-forth conversation, it's likely two people
  if (questionCount > 0 && lines.length < 20) {
    return true;
  }
  
  // Check for "interview-like" patterns
  const shortResponses = lines.filter(line => line.split(' ').length < 15).length;
  const longResponses = lines.filter(line => line.split(' ').length >= 15).length;
  
  // If there's a mix of short and long responses, it's likely an interview (two people)
  if (shortResponses > 0 && longResponses > 0) {
    return true;
  }
  
  return false;
}

// Helper function to enforce consistent speaker labeling
function enforceConsistentSpeakers(
  result: { segments: TranscriptSegment[], speakerCount: number },
  isLikelyTwoPerson: boolean
): { segments: TranscriptSegment[], speakerCount: number } {
  // If we think it's a two-person conversation, limit to Speaker 1 and Speaker 2
  if (isLikelyTwoPerson) {
    // Map any Speaker 3+ to either Speaker 1 or Speaker 2 based on context
    const speakerMap = new Map<string, string>();
    const normalizedSegments = result.segments.map(segment => {
      const speaker = segment.speaker || '';
      
      // If it's Speaker 1 or 2, keep it
      if (speaker === 'Speaker 1' || speaker === 'Speaker 2') {
        return segment;
      }
      
      // For any other speaker, map to either Speaker 1 or 2
      if (!speakerMap.has(speaker)) {
        // Assign to whichever speaker has spoken less so far
        const speaker1Count = result.segments.filter(s => s.speaker === 'Speaker 1').length;
        const speaker2Count = result.segments.filter(s => s.speaker === 'Speaker 2').length;
        speakerMap.set(speaker, speaker1Count <= speaker2Count ? 'Speaker 1' : 'Speaker 2');
      }
      
      return {
        ...segment,
        speaker: speakerMap.get(speaker)
      };
    });
    
    return {
      segments: normalizedSegments,
      speakerCount: 2
    };
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
    const lineCount = text.split('\n').filter(line => line.trim().length > 0).length;
    const lowerText = text.toLowerCase();
    
    // MINIMAL LENGTH CHECK: Only reject extremely short messages
    // For very short transcripts, simply return a standard message without calling the API
    if (text.length < 200 || wordCount < 30 || lineCount < 3) {
      return {
        summary: "The transcript is too brief for a meaningful summary. It contains only a short exchange.",
        actionItems: [],
        keywords: []
      };
    }
    
    // Check for test messages but only if they're short
    // This prevents false positives on longer legitimate transcripts that might mention "test"
    if ((lowerText.includes('test') || lowerText.includes('hallucinate')) && 
        (text.length < 300 || lineCount < 5)) {
      return {
        summary: "This appears to be a test message. No summary is needed.",
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
          3. If the transcript is very short or just contains greetings, state that it's too brief for a meaningful summary
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
            "summary": "A concise summary of the meeting reflecting ONLY content that is actually in the transcript. Important sections like 'Decisions Made' and 'Challenges' should be included directly in the summary without any markdown formatting symbols. Use proper paragraph breaks but avoid using markdown formatting.",
            "actionItems": [
              "Person X needs to complete task Y by deadline Z",
              "Team needs to follow up on...",
              "etc."
            ],
            "keywords": ["keyword1", "keyword2", "etc"]
          }
          
          If there are no clear action items in the transcript, return an empty array for actionItems.
          For the action items, only include items that are SPECIFICALLY mentioned as tasks to be done with clear ownership.
          Structure the summary with clear paragraphs but DO NOT use markdown formatting symbols like asterisks or hashtags.`
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1 // Use very low temperature for factual responses
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);
    
    // ADDITIONAL VALIDATION: Only for shorter transcripts (not for long legitimate transcripts)
    // Only check for hallucination if the transcript is relatively short
    if (wordCount < 150 && result.summary.length > wordCount) {
      // Summary is suspiciously long compared to the original text - likely hallucinated
      return {
        summary: "The transcript is too brief for a meaningful summary. It contains only a short exchange.",
        actionItems: [],
        keywords: []
      };
    }
    
    // CONTENT VERIFICATION: Only for shorter transcripts
    // Don't run verification on longer transcripts that are likely legitimate 
    if (wordCount < 200) {
      const commonHallucinatedTerms = ["marketing strategy", "budget", "client presentation", 
        "resource allocation", "development team", "performance review", "project", "initiatives"];
        
      let potentialHallucination = false;
      for (const term of commonHallucinatedTerms) {
        if (result.summary.toLowerCase().includes(term) && !lowerText.includes(term)) {
          potentialHallucination = true;
          break;
        }
      }
      
      if (potentialHallucination) {
        return {
          summary: "Unable to generate a reliable summary. The content is too limited or ambiguous for accurate summarization.",
          actionItems: [],
          keywords: []
        };
      }
    }
    
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
