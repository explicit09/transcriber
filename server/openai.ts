import OpenAI from "openai";
import fs from "fs";
import Bottleneck from "bottleneck";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

interface EnhancedTranscriptSegment extends TranscriptSegment {
  confidence: number;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default_key",
});

const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,
});

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((res) => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

export async function transcribeAudio(
  audioFilePath: string
): Promise<{ text: string; duration?: number; language?: string }> {
  const streamFactory = () => fs.createReadStream(audioFilePath);

  const transcription = await limiter.schedule(() =>
    withRetry(() =>
      openai.audio.transcriptions.create({
        file: streamFactory(),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      })
    )
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
  // ---- Optional translation branch ---------------------------------------
  if (options.enableTranslation && options.targetLanguage) {
    const translation = await limiter.schedule(() =>
      withRetry(() =>
        openai.audio.translations.create({
          file: fs.createReadStream(audioFilePath),
          model: "whisper-1",
          response_format: "verbose_json",
        })
      )
    );

    const translationText =
      typeof translation === "string" ? translation : (translation as any).text || "";

    const translationLanguage =
      typeof translation === "string"
        ? options.targetLanguage
        : (translation as any).language || options.targetLanguage;

    return {
      text: translationText,
      translatedText: translationText,
      language: translationLanguage,
      structuredTranscript: {
        segments: [],
        metadata: {
          speakerCount: 1,
          duration: undefined,
          language: translationLanguage,
        },
      },
    };
  }
  // ------------------------------------------------------------------------

  const streamFactory = () => fs.createReadStream(audioFilePath);
  const transcription = await limiter.schedule(() =>
    withRetry(() =>
      openai.audio.transcriptions.create({
        file: streamFactory(),
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      })
    )
  );

  const text = transcription.text;
  const duration = transcription.duration;
  const language = transcription.language;

  // --------- Build initial segment list -----------------------------------
  let segments: EnhancedTranscriptSegment[] = transcription.segments
    ? (transcription.segments as WhisperSegment[])
        .map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text.trim(),
          speaker: undefined,
          confidence: s.confidence ?? 1.0,
        }))
        .sort((a, b) => a.start - b.start)
    : [];

  // Merge ultra‑short segments (<0.3 s) into their left neighbour
  segments = segments.reduce((acc: EnhancedTranscriptSegment[], curr) => {
    if (!acc.length) return [curr];
    const prev = acc[acc.length - 1];
    if (curr.start - prev.end < 0.3 && curr.start >= prev.start) {
      prev.end = curr.end;
      prev.text = `${prev.text} ${curr.text}`;
      prev.confidence = Math.min(prev.confidence, curr.confidence);
      return acc;
    }
    return [...acc, curr];
  }, []);

  // ------------- ALWAYS‑ON SPEAKER DIARIZATION ----------------------------
  let speakerCount = 1;
  if (segments.length) {
    const { segments: diarized, speakerCount: count } = await processSpeakerDiarization(
      segments as TranscriptSegment[],
      text
    );

    // Glue very‑close same‑speaker segments together
    const processed = (diarized as EnhancedTranscriptSegment[]).map((seg, i, arr) => {
      if (
        i > 0 &&
        seg.start - arr[i - 1].end < 0.3 &&
        seg.speaker === arr[i - 1].speaker &&
        seg.confidence > 0.8 &&
        arr[i - 1].confidence > 0.8
      ) {
        arr[i - 1].end = seg.end;
        arr[i - 1].text = `${arr[i - 1].text} ${seg.text}`;
        return null as unknown as EnhancedTranscriptSegment; // will be filtered
      }
      return seg;
    }).filter(Boolean);

    speakerCount = count;
    segments = processed;
  }
  // ------------------------------------------------------------------------

  // Resolve overlaps between different speakers
  segments = segments.reduce((acc: EnhancedTranscriptSegment[], curr) => {
    if (!acc.length) return [curr];
    const prev = acc[acc.length - 1];
    if (curr.start < prev.end && curr.speaker !== prev.speaker) {
      const mid = (curr.start + prev.end) / 2;
      prev.end = mid;
      curr.start = mid;
    }
    return [...acc, curr];
  }, []);

  const structuredTranscript: StructuredTranscript = {
    segments: segments as TranscriptSegment[],
    metadata: { speakerCount, duration: duration || 0, language },
  };

  return { text, structuredTranscript, duration, language };
}

// ---------------- Speaker Diarization Helper -----------------------------
async function processSpeakerDiarization(
  timestampedSegments: TranscriptSegment[],
  fullText: string | null
): Promise<{ segments: TranscriptSegment[]; speakerCount: number }> {
  const segmentsText = timestampedSegments
    .map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`)
    .join("\n");
  const safeFullText = fullText || segmentsText;

  const response = await limiter.schedule(() =>
    withRetry(() =>
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert at speaker diarization for conversational audio.\n\nOutput a JSON object with 'segments' (matching count) and 'speakerCount'. Each segment must keep start, end, text and add a 'speaker' label.`,
          },
          {
            role: "user",
            content: `Segments with timestamps:\n${segmentsText}\n\nFull text (context):\n${safeFullText}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      })
    )
  );

  let result: { segments: TranscriptSegment[]; speakerCount: number };
  try {
    result = JSON.parse(response.choices[0].message.content);
  } catch {
    // Fallback: single speaker
    result = {
      speakerCount: 1,
      segments: timestampedSegments.map((s) => ({ ...s, speaker: "Speaker 1" })),
    };
  }

  return enforceConsistentSpeakers(result);
}

function enforceConsistentSpeakers(result: {
  segments: TranscriptSegment[];
  speakerCount: number;
}): { segments: TranscriptSegment[]; speakerCount: number } {
  const labels = [...new Set(result.segments.map((s) => s.speaker || "Speaker 1"))];
  const map = new Map<string, string>();
  labels.forEach((label, idx) => map.set(label, `Speaker ${idx + 1}`));

  const normalized = result.segments.map((s) => ({
    ...s,
    speaker: map.get(s.speaker || "Speaker 1")!,
  }));

  return { segments: normalized, speakerCount: map.size };
}

// ---------------- Utility helpers ----------------------------------------
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// ---------------- OPTIONAL: summary & translation helpers ----------------
export async function generateTranscriptSummary(text: string | null) {
  if (!text) return { summary: "No text provided.", actionItems: [], keywords: [] };
  if (text.split(/\s+/).length < 10)
    return { summary: "Too short.", actionItems: [], keywords: [] };

  const response = await limiter.schedule(() =>
    withRetry(() =>
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing conversations and producing concise structured summaries in JSON.",
          },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
      })
    )
  );

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return { summary: "Error generating summary.", actionItems: [], keywords: [] };
  }
}

export async function translateTranscript(text: string | null, targetLanguage: string) {
  if (!text) return { translatedText: "No text provided.", confidence: 0 };

  const response = await limiter.schedule(() =>
    withRetry(() =>
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Translate the following text to ${targetLanguage} while preserving speaker labels and timestamps. Return JSON with 'translatedText' and 'confidence'.`,
          },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 4000,
      })
    )
  );

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return { translatedText: `Error translating to ${targetLanguage}.`, confidence: 0 };
  }
}
