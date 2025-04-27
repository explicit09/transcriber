import OpenAI from "openai";
import fs from "fs";
import Bottleneck from "bottleneck";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'default_key'
});

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200
});

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(res => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

export async function transcribeAudio(audioFilePath: string): Promise<{ text: string; duration?: number; language?: string }> {
  const streamFactory = () => fs.createReadStream(audioFilePath);

  const transcription = await limiter.schedule(() =>
    withRetry(() => openai.audio.transcriptions.create({
      file: streamFactory(),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    }))
  );

  return {
    text: transcription.text,
    duration: transcription.duration,
    language: transcription.language,
  };
}

export async function transcribeAudioWithFeatures(
  audioFilePath: string,
  options: {
    enableSpeakerDiarization?: boolean;
    enableTranslation?: boolean;
    targetLanguage?: string;
  } = {}
): Promise<{
  text: string;
  structuredTranscript: StructuredTranscript;
  duration?: number;
  language?: string;
  translatedText?: string;
}> {
  if (options.enableTranslation && options.targetLanguage) {
    const translation = await limiter.schedule(() =>
      withRetry(() => openai.audio.translations.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        response_format: 'verbose_json'
      }))
    );
    
    // Handle the translation response based on its actual shape
    const translationText = typeof translation === 'string' 
      ? translation 
      : (translation as any).text || '';
    
    const translationLanguage = typeof translation === 'string' 
      ? options.targetLanguage 
      : (translation as any).language || options.targetLanguage;
    
    return {
      text: translationText,
      translatedText: translationText,
      language: translationLanguage,
      structuredTranscript: {
        segments: [],
        metadata: { speakerCount: 1, duration: undefined, language: translationLanguage }
      }
    };
  }

  // Call Whisper API directly to get segments
  const streamFactory = () => fs.createReadStream(audioFilePath);
  const transcription = await limiter.schedule(() =>
    withRetry(() => openai.audio.transcriptions.create({
      file: streamFactory(),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    }))
  );

  const text = transcription.text;
  const duration = transcription.duration;
  const language = transcription.language;

  // Map the raw Whisper segments to our TranscriptSegment structure
  let segments: TranscriptSegment[] = transcription.segments
    ? transcription.segments.map((s: any) => ({ start: s.start, end: s.end, text: s.text, speaker: undefined }))
    : [];

  let speakerCount: number | undefined;

  if (options.enableSpeakerDiarization && segments.length) {
    // Pass the original segments and the full text to the diarization process
    const { segments: diarizedSegments, speakerCount: count } = await processSpeakerDiarization(segments, text);
    speakerCount = count;
    segments.length = 0;
    segments.push(...diarizedSegments);
  }

  const structuredTranscript: StructuredTranscript = {
    segments,
    metadata: { speakerCount, duration, language },
  };

  return { text, structuredTranscript, duration, language };
}

async function processSpeakerDiarization(timestampedSegments: TranscriptSegment[], fullText: string | null): Promise<{ segments: TranscriptSegment[]; speakerCount: number }> {
  const segmentsText = timestampedSegments.map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`).join('\n');
  const safeFullText = fullText || segmentsText;

  console.log('--- Calling GPT-4o for Diarization ---');
  console.log('Segments Text Snippet:', segmentsText.substring(0, 200) + '...');
  console.log('Full Text Snippet:', safeFullText ? safeFullText.substring(0, 200) + '...' : 'N/A');

  const response = await limiter.schedule(() =>
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are an expert at speaker diarization for conversational audio. Your task is to identify different speakers in the transcript.

Rules for speaker identification:
1. Look for clear speaker transitions like: questions and answers, agreements/disagreements, interjections, addressing others, and topic shifts.
2. Pay attention to speech patterns, filler words, and consistent speaking styles that may indicate the same speaker.
3. Identify when someone refers to "you" or "we" or asks a question that another person answers.
4. When a statement is followed by a response like "Yeah", "No", "Okay", "Thank you", or similar short responses, these likely indicate different speakers.
5. Label speakers consistently as "Speaker 1", "Speaker 2", etc.

Balanced approach:
- Unlike most diarization systems, prefer slightly overestimating speakers rather than underestimating when analyzing conversations.
- When in doubt about whether a segment represents a new speaker, consider the flow of conversation and context.

Output format:
- Return a JSON object with fields 'segments' (array) and 'speakerCount' (number).
- Each segment in the array must include: start (number), end (number), text (string), and speaker (string, e.g., "Speaker 1").
- The segments array should match the input segments length exactly, with added speaker labels.
- Example: { "segments": [{"start": 0, "end": 5, "text": "Hello", "speaker": "Speaker 1"}], "speakerCount": 1 }` 
        },
        { 
          role: 'user', 
          content: `Analyze this conversation transcript for different speakers and return a JSON response.

This is a conversation between multiple people. Please identify speaker changes throughout the transcript.

Transcript with timestamps:
${segmentsText}

Full text for context:
${safeFullText}` 
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }))
  );

  console.log('--- GPT-4o Diarization Response ---');
  const rawResponseContent = response.choices[0].message.content;
  console.log('Raw Response:', rawResponseContent);

  let result;
  try {
    // Check if content is a valid string before parsing
    if (typeof rawResponseContent !== 'string') {
      throw new Error('Received null or non-string content from GPT for diarization.');
    }
    result = JSON.parse(rawResponseContent);
    console.log('Parsed Response:', JSON.stringify(result, null, 2));
  } catch (parseError) {
    // Ensure parseError is logged as a string
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    console.error(`!!! Failed to parse GPT Diarization Response: ${errorMessage}`);
    // Explicitly create a string variable for logging
    const contentToLog = typeof rawResponseContent === 'string' ? rawResponseContent : 'null';
    console.error(`Raw content that failed parsing: ${contentToLog}`);
    result = {
      speakerCount: 1,
      segments: timestampedSegments.map(s => ({ ...s, speaker: 'Speaker 1' }))
    };
    console.log('Falling back to default single speaker.');
  }

  const validated = enforceConsistentSpeakers(result);
  const speakerCountFromGPT = result.speakerCount || validated.speakerCount;

  if (speakerCountFromGPT > 8) {
    console.warn(`⚠️ High number of speakers detected (${speakerCountFromGPT}). Review recommended.`);
  }

  console.log('--- Returning from processSpeakerDiarization ---');
  console.log('Final Speaker Count:', speakerCountFromGPT);
  console.log('Final Segments Snippet:', JSON.stringify(validated.segments.slice(0, 3), null, 2)); // Log first 3 segments

  return { segments: validated.segments, speakerCount: speakerCountFromGPT };
}

function enforceConsistentSpeakers(result: { segments: TranscriptSegment[]; speakerCount: number }): { segments: TranscriptSegment[]; speakerCount: number } {
  const labels = [...new Set(result.segments.map(s => s.speaker || 'Speaker 1'))];
  const map = new Map<string, string>();
  labels.forEach((label, index) => {
    map.set(label, `Speaker ${index + 1}`);
  });

  const normalizedSegments = result.segments.map(s => ({
    ...s,
    speaker: map.get(s.speaker || 'Speaker 1')!
  }));

  return { segments: normalizedSegments, speakerCount: map.size };
}

export async function generateTranscriptSummary(text: string | null) {
  if (!text) {
    return { summary: 'No text provided.', actionItems: [], keywords: [] };
  }
  
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) {
    return { summary: 'Too short.', actionItems: [], keywords: [] };
  }

  const response = await limiter.schedule(() =>
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Summarize clearly and only what's stated. Provide output in JSON format with fields for "summary", "actionItems" (array), and "keywords" (array).` },
        { role: 'user', content: `Analyze this transcript and provide a JSON response with summary, action items, and keywords: ${text}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    }))
  );

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("Error parsing summary result:", error);
    return { summary: "Error generating summary.", actionItems: [], keywords: [] };
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Text translation function
export async function translateTranscript(text: string | null, targetLanguage: string) {
  if (!text) {
    return { translatedText: "No text provided for translation." };
  }
  
  const response = await limiter.schedule(() => 
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are a professional translator. Translate the following text to ${targetLanguage}, preserving all formatting and speaker information. Return your response as a JSON object with the following structure: { "translatedText": "text translated to ${targetLanguage}" }` 
        },
        { role: 'user', content: `Translate the following text to ${targetLanguage} and return as JSON:\n${text}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4000
    }))
  );

  try {
    const result = JSON.parse(response.choices[0].message.content);
    return { translatedText: result.translatedText || "" };
  } catch (error) {
    console.error("Error parsing translation result:", error);
    return { translatedText: "Translation error occurred." };
  }
}
