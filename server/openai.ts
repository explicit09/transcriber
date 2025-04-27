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
    ? (text as any).segments.map((s: any) => ({ start: s.start, end: s.end, text: s.text, speaker: undefined }))
    : [];

  let speakerCount: number | undefined;

  if (options.enableSpeakerDiarization && segments.length) {
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

async function processSpeakerDiarization(timestampedSegments: TranscriptSegment[], fullText: string): Promise<{ segments: TranscriptSegment[]; speakerCount: number }> {
  const segmentsText = timestampedSegments.map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`).join('\n');

  const response = await limiter.schedule(() =>
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are an expert at speaker diarization. Label speakers only when it is extremely clear from the text and timing that a different speaker is present. If uncertain, assume the same speaker continues. Prefer underestimating speakers rather than overestimating. Label consistently as \"Speaker 1\", \"Speaker 2\", etc.` },
        { role: 'user', content: `Transcript:\n${segmentsText}\nFull text:\n${fullText}\nAt the end, provide total number of speakers you detected.` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }))
  );

  let result;
  try {
    result = JSON.parse(response.choices[0].message.content);
  } catch {
    result = {
      speakerCount: 1,
      segments: timestampedSegments.map(s => ({ ...s, speaker: 'Speaker 1' }))
    };
  }

  const validated = enforceConsistentSpeakers(result);
  const speakerCountFromGPT = result.speakerCount || validated.speakerCount;

  if (speakerCountFromGPT > 8) {
    console.warn(`⚠️ High number of speakers detected (${speakerCountFromGPT}). Review recommended.`);
  }

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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Text translation function
export async function translateTranscript(text: string, targetLanguage: string) {
  const response = await limiter.schedule(() => 
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are a professional translator. Translate the following text to ${targetLanguage}, preserving all formatting and speaker information. Return your response as a JSON object with the following structure: { "translatedText": "text translated to ${targetLanguage}" }` 
        },
        { role: 'user', content: text }
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
