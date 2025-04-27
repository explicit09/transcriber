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
    enableTimestamps?: boolean;
    language?: string;
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

  console.log(`Processing diarization for ${timestampedSegments.length} segments`);

  try {
    const response = await limiter.schedule(() =>
      withRetry(() =>
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an expert at speaker diarization for conversational audio.

Your task is to identify different speakers in a transcript and label each segment.
- Analyze speaking patterns, vocabulary choices, speaking styles, and contextual clues to determine speaker changes
- Use "Speaker 1", "Speaker 2", etc. as labels consistently throughout the transcript
- Even if you're uncertain, make your best effort to distinguish between speakers
- Maintain the original start and end timestamps for each segment
- Include the exact same text for each segment as provided

Key indicators of speaker changes:
- Changes in topic or perspective
- Responses to questions
- Greeting/introduction patterns
- Different vocabulary usage or speaking style
- References to oneself vs references to others
- Questions followed by answers (likely different speakers)

Output a JSON object with:
1. 'segments' - an array of objects, each with:
   - start: number (timestamp in seconds)
   - end: number (timestamp in seconds)
   - text: string (the spoken text)
   - speaker: string (e.g., "Speaker 1", "Speaker 2")
2. 'speakerCount' - total number of unique speakers identified (at least 2 for most conversations)

IMPORTANT: Most conversation transcripts have AT LEAST 2 speakers. Be especially attentive to dialog patterns, question/answer pairs, and changes in speaking style.`,
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
      const content = response.choices[0].message.content || "";
      result = JSON.parse(content);
      
      // Log successful parsing
      console.log(`Successfully parsed diarization response. Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`);
      
      // Validate the result has the expected structure
      if (!result.segments || !Array.isArray(result.segments)) {
        throw new Error("Response missing segments array");
      }
      
      if (result.segments.length === 0) {
        throw new Error("Response has empty segments array");
      }
      
      // Check that speaker labels are included
      const hasSpeakers = result.segments.some((s: any) => s.speaker);
      if (!hasSpeakers) {
        // If no speakers are detected despite getting a response, force assign speakers
        console.warn("No speaker labels detected in response, assigning default speakers");
        
        // Try to detect conversation turns
        let currentTurn = 0;
        let lastEnd = 0;
        
        // Assign speakers based on pauses in conversation or length
        result.segments = result.segments.map((segment, index) => {
          const pauseDetected = segment.start - lastEnd > 1.5; // Significant pause
          const longUtterance = index > 0 && 
                               (segment.end - segment.start > 8) && 
                               (result.segments[index-1].end - result.segments[index-1].start < 5);
          
          // Change speaker if we detect a significant pause or pattern change
          if (index === 0 || pauseDetected || longUtterance) {
            currentTurn = (currentTurn + 1) % 2; // Alternate between 0 and 1
          }
          
          lastEnd = segment.end;
          return {
            ...segment,
            speaker: `Speaker ${currentTurn + 1}`
          };
        });
        
        result.speakerCount = 2; // Set minimum of two speakers
      }
      
      return enforceConsistentSpeakers(result);
    } catch (error) {
      console.error("Error parsing diarization response:", error);
      
      if (response.choices && response.choices[0] && response.choices[0].message) {
        const previewContent = response.choices[0].message.content || "";
        console.error("Response content:", previewContent.substring(0, 200) + "...");
      }
      
      // Fallback: single speaker with detailed logging
      console.log("Falling back to single speaker diarization");
      result = {
        speakerCount: 1,
        segments: timestampedSegments.map((s) => ({ ...s, speaker: "Speaker 1" })),
      };
      return result;
    }
  } catch (apiError) {
    console.error("API error during diarization:", apiError);
    
    // Fallback: single speaker
    return {
      speakerCount: 1,
      segments: timestampedSegments.map((s) => ({ ...s, speaker: "Speaker 1" })),
    };
  }
}

function enforceConsistentSpeakers(result: {
  segments: TranscriptSegment[];
  speakerCount: number;
}): { segments: TranscriptSegment[]; speakerCount: number } {
  // Use Array.from instead of spread operator for Set to avoid TSC issues
  const labels = Array.from(new Set(result.segments.map((s) => s.speaker || "Speaker 1")));
  console.log("Speaker labels before normalization:", labels.join(", "));
  
  // Create a mapping of detected labels to normalized Speaker N format
  const map = new Map<string, string>();
  labels.forEach((label, idx) => {
    // If the label already follows the pattern "Speaker N", try to preserve the number
    const match = label.match(/^Speaker\s+(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      // Check if this number is already used
      const numUsed = Array.from(map.values()).some(v => v === `Speaker ${num}`);
      if (!numUsed) {
        map.set(label, `Speaker ${num}`);
        return;
      }
    }
    
    // Otherwise assign a new number
    map.set(label, `Speaker ${idx + 1}`);
  });
  
  console.log("Speaker mapping:", 
    Array.from(map.entries())
      .map(([from, to]) => `${from} -> ${to}`)
      .join(", ")
  );

  // Apply the mapping
  const normalized = result.segments.map((s) => ({
    ...s,
    speaker: map.get(s.speaker || "Speaker 1") || "Speaker 1",
  }));

  return { 
    segments: normalized, 
    speakerCount: map.size || 1 // Ensure at least 1 speaker
  };
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
              "You are an expert at analyzing conversations and producing concise structured summaries in JSON. Always respond with a JSON object containing the following fields exactly: 'summary' (a concise paragraph), 'actionItems' (an array of strings), and 'keywords' (an array of strings).",
          },
          { 
            role: "user", 
            content: `Please analyze the following transcript and create a summary, extract action items, and identify key topics/keywords. Return as a JSON object with these fields:
- summary: A concise paragraph summarizing the main points
- actionItems: An array of specific tasks or follow-ups mentioned
- keywords: An array of important topics/terms discussed

Transcript:
${text}`
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1500,
      })
    )
  );

  try {
    const content = response.choices[0].message.content || "";
    console.log("OpenAI summary response:", content);
    const parsedContent = JSON.parse(content);
    
    // Ensure the object has all required fields
    return {
      summary: parsedContent.summary || "No summary available.",
      actionItems: Array.isArray(parsedContent.actionItems) ? parsedContent.actionItems : [],
      keywords: Array.isArray(parsedContent.keywords) ? parsedContent.keywords : []
    };
  } catch (error) {
    console.error("Error parsing summary:", error);
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
    const content = response.choices[0].message.content || "";
    return JSON.parse(content);
  } catch {
    return { translatedText: `Error translating to ${targetLanguage}.`, confidence: 0 };
  }
}
