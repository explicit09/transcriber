import OpenAI from "openai";
import fs from "fs";
import Bottleneck from "bottleneck";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";

// Use the latest model unless explicitly overridden
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'default_key'
});

// Concurrency limiter for API calls
const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200 // at most 5 requests per second
});

// Exponential-backoff retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise(res => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// Basic audio transcription
export async function transcribeAudio(
  audioFilePath: string
): Promise<{ text: string; duration?: number; language?: string }> {
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

// Enhanced transcription with features
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
  // Transcribe or translate directly with Whisper if requested
  if (options.enableTranslation && options.targetLanguage) {
    // Whisper audio-to-text translation
    const translation = await limiter.schedule(() => 
      withRetry(() => openai.audio.translations.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: options.targetLanguage,
      }))
    );
    return { text: translation.text, translatedText: translation.text, language: translation.language };
  }

  // Standard transcription
  const { text, duration, language } = await transcribeAudio(audioFilePath);

  // Build segments
  const segments: TranscriptSegment[] = text && Array.isArray((text as any).segments)
    ? (text as any).segments.map((s: any) => ({ start: s.start, end: s.end, text: s.text, speaker: undefined }))
    : [];

  let speakerCount: number | undefined;

  if (options.enableSpeakerDiarization && segments.length) {
    const { segments: diaSegments, speakerCount: count } =
      await processSpeakerDiarization(segments, text);
    speakerCount = count;
    // Replace segments
    segments.length = 0;
    segments.push(...diaSegments);
  }

  const structuredTranscript: StructuredTranscript = {
    segments,
    metadata: { speakerCount, duration, language },
  };

  return { text, structuredTranscript, duration, language };
}

// Speaker diarization via GPT
async function processSpeakerDiarization(
  timestampedSegments: TranscriptSegment[],
  fullText: string
): Promise<{ segments: TranscriptSegment[]; speakerCount: number }> {
  const segmentsText = timestampedSegments
    .map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`)
    .join('\n');

  const response = await limiter.schedule(() => 
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are an expert at speaker diarization. Identify the exact number of speakers and label segments as "Speaker X".` },
        { role: 'user', content: `Transcript:\n${segmentsText}\nFull text:\n${fullText}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }))
  );

  let result;
  try {
    result = JSON.parse(response.choices[0].message.content);
  } catch {
    // Fallback: majority-based assignment
    const primary = timestampedSegments[0];
    result = { speakerCount: 1, segments: timestampedSegments.map(s => ({ ...s, speaker: 'Speaker 1' })) };
  }

  // Normalize and enforce labeling
  return enforceConsistentSpeakers(result);
}

// Ensure speakers are labeled "Speaker X" and count correct
function enforceConsistentSpeakers(
  result: { segments: TranscriptSegment[]; speakerCount: number }
): { segments: TranscriptSegment[]; speakerCount: number } {
  const labels = [...new Set(result.segments.map(s => s.speaker || 'Speaker 1'))];
  const map = new Map<string, string>();
  labels.forEach((lbl, i) => map.set(lbl, `Speaker ${i + 1}`));
  const segments = result.segments.map(s => ({
    ...s,
    speaker: map.get(s.speaker || 'Speaker 1')!
  }));
  return { segments, speakerCount: map.size };
}

// Summary generation using GPT
export async function generateTranscriptSummary(text: string) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) return { summary: 'Too short.', actionItems: [], keywords: [] };

  const response = await limiter.schedule(() => 
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Summarize clearly and only what's stated.` },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500
    }))
  );

  return JSON.parse(response.choices[0].message.content);
}

// Helper: format seconds to MM:SS
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
