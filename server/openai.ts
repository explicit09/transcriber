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
          content: `You are an expert speech and conversation analyst specializing in precise speaker diarization. Your task is to analyze a transcript and accurately identify different speakers, even with minimal context.

IMPROVED SPEAKER ANALYSIS APPROACH:
1. First, read the entire transcript to understand the overall flow, topics, and speaking styles
2. For most conversations, assume 2 speakers unless there is CLEAR evidence of 3+ distinct voices
3. Be CONSERVATIVE with speaker assignments - prefer fewer speakers rather than more
4. Track topic ownership - speakers often maintain control of their introduced topics
5. Note linguistic markers that identify individuals (personal anecdotes, self-references, etc.)
6. Pay special attention to question-answer patterns, which almost always involve different speakers

CONVERSATION PATTERN RECOGNITION:
- First-person pronoun shifts ("I believe" vs "You mentioned") strongly indicate different speakers
- Speech pattern changes (formal/academic vs casual/colloquial) often signal different speakers
- Technical explanations followed by clarifying questions typically indicate different speakers
- Statements of agreement ("Yes," "I agree," "That's right") nearly always indicate a speaker change
- Short filler words like "hmm", "uh", "yeah" are not reliable indicators of speaker changes

ACCURACY GUIDELINES:
- For normal dialogues, default to 2 speakers unless you have overwhelming evidence of more
- Consistently assign the same speaker ID to the same person throughout the transcript
- For short exchanges (1-2 sentences each), be extremely cautious about assigning more than 2 speakers
- Prefer "Speaker 1," "Speaker 2" format unless roles are extremely clear (like "Interviewer/Interviewee")
- Be very cautious about inferring more than 2 speakers from minor stylistic differences alone

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
In business contexts, use "Facilitator" and "Participant" only if the roles are unambiguous.
Otherwise, use "Speaker 1", "Speaker 2", etc.`
        },
        {
          role: "user",
          content: `Here is the transcript with timestamps:\n\n${segmentsText}\n\nFull transcript for context:\n${fullText}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1 // Lower temperature for more consistent results
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse the JSON response
    const result = JSON.parse(content);
    
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
  actionItems: string[];
  keywords: string[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Summarize the following meeting transcript concisely. 
          
          Extract these components:
          1. Key points and decisions made in the meeting
          2. Action items with clear owners and deadlines (if mentioned)
          3. Important discussion topics
          4. Up to 10 important keywords or phrases
          
          Format your response as a JSON object with the following structure:
          {
            "summary": "A concise summary of the meeting (max 250 words). Important sections like 'Decisions Made' and 'Challenges' should be included directly in the summary without any markdown formatting symbols like asterisks (**). Use proper paragraph breaks but avoid using markdown formatting.",
            "actionItems": [
              "Person X needs to complete task Y by deadline Z",
              "Team needs to follow up on...",
              "etc."
            ],
            "keywords": ["keyword1", "keyword2", "etc"]
          }
          
          For the action items, make them very specific and begin with the person or team responsible.
          Structure the summary with clear paragraphs but DO NOT use markdown formatting symbols like asterisks or hashtags.`
        },
        {
          role: "user",
          content: text
        }
      ],
      response_format: { type: "json_object" }
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
