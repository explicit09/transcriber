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
  minTime: 200 // 5 requests per second
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
  if (options.enableTranslation && options.targetLanguage) {
    const translation = await limiter.schedule(() =>
      withRetry(() => openai.audio.translations.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        language: options.targetLanguage,
      }))
    );
    return {
      text: translation.text,
      translatedText: translation.text,
      language: translation.language,
      structuredTranscript: {
        segments: [],
        metadata: { speakerCount: 1, duration: undefined, language: translation.language }
      }
    };
  }

  const { text, duration, language } = await transcribeAudio(audioFilePath);

  const segments: TranscriptSegment[] = text && Array.isArray((text as any).segments)
    ? (text as any).segments.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text,
        speaker: undefined
      }))
    : [];

  let speakerCount: number | undefined;

  if (options.enableSpeakerDiarization && segments.length) {
    const { segments: diarizedSegments, speakerCount: count } =
      await processSpeakerDiarization(segments, text);
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
        { role: 'system', content: `
          You are an expert at speaker diarization.
          Identify the correct number of speakers based only on text and timing.
          If uncertain, prefer fewer speakers.
          Label speakers consistently as "Speaker 1", "Speaker 2", etc.
        ` },
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
    const primary = timestampedSegments[0];
    result = { 
      speakerCount: 1,
      segments: timestampedSegments.map(s => ({
        ...s,
        speaker: 'Speaker 1'
      }))
    };
  }

  const validated = enforceConsistentSpeakers(result);

  if (validated.speakerCount > 8) {
    console.warn(`⚠️ High number of speakers detected (${validated.speakerCount}). Review recommended.`);
  }

  return validated;
}

// Enforce consistent "Speaker X" labeling
function enforceConsistentSpeakers(
  result: { segments: TranscriptSegment[]; speakerCount: number }
): { segments: TranscriptSegment[]; speakerCount: number } {
  const labels = [...new Set(result.segments.map(s => s.speaker || 'Speaker 1'))];
  const map = new Map<string, string>();
  labels.forEach((label, index) => {
    map.set(label, `Speaker ${index + 1}`);
  });

  const normalizedSegments = result.segments.map(s => ({
    ...s,
    speaker: map.get(s.speaker || 'Speaker 1')!
  }));

  return {
    segments: normalizedSegments,
    speakerCount: map.size
  };
}

// Generate transcript summary using GPT
export async function generateTranscriptSummary(text: string) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 10) {
    return { summary: 'Too short.', actionItems: [], keywords: [] };
  }

  const response = await limiter.schedule(() =>
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Summarize clearly and only what's stated.` },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    }))
  );

  return JSON.parse(response.choices[0].message.content);
}

// Format seconds to MM:SS
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}