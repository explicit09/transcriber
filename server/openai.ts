import OpenAI from "openai";
import fs from "fs";
import Bottleneck from "bottleneck";
import { TranscriptSegment, StructuredTranscript } from "@shared/schema";
import { diarizeAudio } from "./diarization";

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
- Use "Speaker 1", "Speaker 2", "Speaker 3", etc. as labels consistently throughout the transcript
- Even if you're uncertain, make your best effort to distinguish between speakers
- Maintain the original start and end timestamps for each segment
- Include the exact same text for each segment as provided
- IMPORTANT: You MUST accurately identify ALL speakers in the conversation, even if there are more than 2

Key indicators of speaker changes:
- Changes in topic or perspective
- Responses to questions
- Greeting/introduction patterns
- Different vocabulary usage or speaking style
- References to oneself vs references to others (I vs. you, etc.)
- Questions followed by answers (likely different speakers)
- Changes in speaking authority/role (e.g., presenter vs. audience member)
- Direct mentions of others by name ("As John was saying...")

Output a JSON object with:
1. 'segments' - an array of objects, each with:
   - start: number (timestamp in seconds)
   - end: number (timestamp in seconds)
   - text: string (the spoken text)
   - speaker: string (e.g., "Speaker 1", "Speaker 2", "Speaker 3")
2. 'speakerCount' - total number of unique speakers identified

IMPORTANT: Many meetings have MORE THAN 2 participants. Carefully analyze the transcript for evidence of 3, 4, or more distinct speakers. Each time you think a new person is speaking, assign them a new speaker number.`,
            },
            {
              role: "user",
              content: `Segments with timestamps:\n${segmentsText}\n\nFull text (context):\n${safeFullText}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.5,
        })
      )
    );

    let result: { segments: TranscriptSegment[]; speakerCount: number };
    try {
      const content = response.choices[0].message.content || "";
      result = JSON.parse(content);
      
      // Log successful parsing
      console.log(`Successfully parsed diarization response. Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`);
      
      // If we found 3+ speakers, log additional details for debugging
      if (result.speakerCount > 2) {
        const speakerCounts: Record<string, number> = {};
        result.segments.forEach(s => {
          if (s.speaker) {
            speakerCounts[s.speaker] = (speakerCounts[s.speaker] || 0) + 1;
          }
        });
        console.log('Speaker distribution:', JSON.stringify(speakerCounts));
      }
      
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
        
        // Try to detect conversation turns with up to 4 potential speakers
        let currentTurn = 0;
        let lastEnd = 0;
        let activeSpeakers = 2; // Start with assumption of 2 speakers minimum
        
        // Assign speakers based on pauses in conversation or length
        result.segments = result.segments.map((segment, index) => {
          const pauseDetected = segment.start - lastEnd > 1.5; // Significant pause
          const longUtterance = index > 0 && 
                               (segment.end - segment.start > 8) && 
                               (result.segments[index-1].end - result.segments[index-1].start < 5);
          const significantGap = segment.start - lastEnd > 3.0; // Very long pause might indicate new speaker
          
          // Change speaker if we detect a significant pause or pattern change
          if (index === 0 || pauseDetected || longUtterance) {
            // For very significant gaps or every 5th turn, consider introducing a new speaker (up to 4)
            if ((significantGap || index % 5 === 0) && activeSpeakers < 4) {
              activeSpeakers++;
            }
            
            // Cycle through detected speakers
            currentTurn = (currentTurn + 1) % activeSpeakers; 
          }
          
          lastEnd = segment.end;
          return {
            ...segment,
            speaker: `Speaker ${currentTurn + 1}`
          };
        });
        
        result.speakerCount = activeSpeakers; // Use the number of active speakers detected
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

/**
 * Transcribe audio with advanced speaker diarization using pyannote.audio
 * This function uses the more accurate pyannote diarization instead of the text-based approach
 */
export async function transcribeWithPyannote(
  audioFilePath: string,
  options: {
    enableTranslation?: boolean;
    targetLanguage?: string;
    language?: string;
    numSpeakers?: number;
    enableTimestamps?: boolean;
  } = {}
): Promise<{
  text: string;
  structuredTranscript: StructuredTranscript;
  duration?: number;
  language?: string;
  translatedText?: string;
}> {
  // Handle translation case
  if (options.enableTranslation && options.targetLanguage) {
    return handleTranslation(audioFilePath, options.targetLanguage);
  }

  // Step 1: Get diarization results from pyannote.audio
  console.log("Running speaker diarization with pyannote.audio...");
  const diarizationResult = await diarizeAudio(audioFilePath, options.numSpeakers);
  
  if (!diarizationResult.segments || diarizationResult.segments.length === 0) {
    console.warn("Diarization returned no segments, falling back to regular transcription");
    return transcribeAudioWithFeatures(audioFilePath, options);
  }
  
  console.log(`Diarization found ${diarizationResult.segments.length} speaker segments`);
  
  // Step 2: Get transcription from Whisper
  console.log("Transcribing audio with Whisper...");
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
  
  // Step 3: Get Whisper segments
  const whisperSegments = transcription.segments
    ? (transcription.segments as WhisperSegment[])
        .map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text.trim(),
          confidence: s.confidence ?? 1.0,
        }))
        .sort((a, b) => a.start - b.start)
    : [];
  
  if (whisperSegments.length === 0) {
    console.warn("Whisper returned no segments, using full text");
    // Create a single segment if Whisper doesn't provide segments
    whisperSegments.push({
      start: 0,
      end: duration || 0,
      text: text,
      confidence: 1.0,
    });
  }
  
  // Step 4: Align diarization results with Whisper segments
  console.log("Aligning diarization with transcription...");
  const alignedSegments = alignDiarizationWithTranscript(
    diarizationResult.segments,
    whisperSegments
  );
  
  // Step 5: Post-process to enforce desired number of speakers if specified
  let finalSegments = alignedSegments;
  if (options.numSpeakers && options.numSpeakers > 0) {
    console.log(`Enforcing desired speaker count: ${options.numSpeakers}`);
    finalSegments = enforceNumberOfSpeakers(alignedSegments, options.numSpeakers);
  }
  
  // Create final structured transcript
  const speakerSet = new Set(finalSegments.map(s => s.speaker));
  const speakerCount = speakerSet.size;
  
  const structuredTranscript: StructuredTranscript = {
    segments: finalSegments,
    metadata: { 
      speakerCount, 
      duration: duration || 0, 
      language 
    },
  };

  return { text, structuredTranscript, duration, language };
}

/**
 * Handle audio translation using Whisper
 */
async function handleTranslation(audioFilePath: string, targetLanguage: string) {
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
      ? targetLanguage
      : (translation as any).language || targetLanguage;

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

/**
 * Align speaker diarization results with Whisper transcription segments
 */
function alignDiarizationWithTranscript(
  diarization: { start: number; end: number; speaker: string }[],
  whisperSegments: { start: number; end: number; text: string; confidence: number }[]
): TranscriptSegment[] {
  const alignedSegments: TranscriptSegment[] = [];
  
  // Sort both arrays by start time
  const sortedDiarization = [...diarization].sort((a, b) => a.start - b.start);
  const sortedWhisper = [...whisperSegments].sort((a, b) => a.start - b.start);
  
  // For each Whisper segment, find the dominant speaker
  for (const whisperSegment of sortedWhisper) {
    // Find all diarization segments that overlap with this Whisper segment
    const overlappingSegments = sortedDiarization.filter(
      diaSeg => 
        // Check for overlap conditions
        (diaSeg.start <= whisperSegment.end && diaSeg.end >= whisperSegment.start)
    );
    
    if (overlappingSegments.length === 0) {
      // No speaker found, use a default
      alignedSegments.push({
        start: whisperSegment.start,
        end: whisperSegment.end,
        text: whisperSegment.text,
        speaker: "Speaker 1"
      });
      continue;
    }
    
    // Calculate which speaker has the most overlap with this segment
    const speakerOverlaps = new Map<string, number>();
    
    for (const diaSeg of overlappingSegments) {
      // Calculate overlap duration
      const overlapStart = Math.max(diaSeg.start, whisperSegment.start);
      const overlapEnd = Math.min(diaSeg.end, whisperSegment.end);
      const overlapDuration = overlapEnd - overlapStart;
      
      // Add to speaker's total overlap
      const currentOverlap = speakerOverlaps.get(diaSeg.speaker) || 0;
      speakerOverlaps.set(diaSeg.speaker, currentOverlap + overlapDuration);
    }
    
    // Find speaker with maximum overlap
    let maxOverlap = 0;
    let dominantSpeaker = "Speaker 1";
    
    // Use Array.from to convert Map entries to an array to avoid linter error
    Array.from(speakerOverlaps.entries()).forEach(([speaker, overlap]) => {
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        dominantSpeaker = speaker;
      }
    });
    
    // Create aligned segment with the dominant speaker
    alignedSegments.push({
      start: whisperSegment.start,
      end: whisperSegment.end,
      text: whisperSegment.text,
      speaker: dominantSpeaker
    });
  }
  
  return alignedSegments;
}

/**
 * Enforce the maximum number of speakers in the result
 * This helps when pyannote.audio over-segments speakers despite specifying num_speakers
 */
function enforceNumberOfSpeakers(
  segments: TranscriptSegment[],
  desiredNumSpeakers: number
): TranscriptSegment[] {
  if (!segments.length || desiredNumSpeakers <= 0) {
    return segments;
  }
  
  // Get the current speaker IDs
  const speakerSet = new Set<string>();
  segments.forEach(segment => {
    if (segment.speaker) {
      speakerSet.add(segment.speaker);
    }
  });
  
  const speakers = Array.from(speakerSet);
  
  // If we already have the correct number, no changes needed
  if (speakers.length <= desiredNumSpeakers) {
    return segments;
  }
  
  console.log(`Too many speakers detected (${speakers.length} vs desired ${desiredNumSpeakers}) - merging similar speakers`);
  
  // We need to reduce the number of speakers
  // More advanced strategy: Analyze speaker patterns and merge similar speakers
  
  // 1. Count speaker frequencies and calculate segment durations
  const speakerStats: Record<string, {count: number, totalDuration: number, avgSegmentLength: number}> = {};
  
  segments.forEach(segment => {
    if (!segment.speaker) return;
    
    const speaker = segment.speaker;
    if (!speakerStats[speaker]) {
      speakerStats[speaker] = {count: 0, totalDuration: 0, avgSegmentLength: 0};
    }
    
    const duration = segment.end - segment.start;
    speakerStats[speaker].count += 1;
    speakerStats[speaker].totalDuration += duration;
  });
  
  // Calculate average segment length for each speaker
  for (const speaker in speakerStats) {
    speakerStats[speaker].avgSegmentLength = 
      speakerStats[speaker].totalDuration / speakerStats[speaker].count;
  }
  
  // 2. Sort speakers by their prevalence (most frequent/longest first)
  const sortedSpeakers = Object.entries(speakerStats)
    .sort((a, b) => {
      // Prioritize speakers with more content
      if (b[1].totalDuration > a[1].totalDuration * 3) return 1;
      if (a[1].totalDuration > b[1].totalDuration * 3) return -1;
      
      // If similar duration, look at frequency and avg segment length
      return b[1].count - a[1].count;
    })
    .map(entry => entry[0]);
  
  // 3. Keep the top N speakers, merge the rest based on timing patterns
  const speakersToKeep = sortedSpeakers.slice(0, desiredNumSpeakers);
  
  // 4. Build a speaker similarity map
  const speakerSimilarity: Record<string, string[]> = {};
  
  // First, analyze adjacent segments for the same speakers
  let lastSpeaker = '';
  let speakerTransitions: Record<string, Record<string, number>> = {};
  
  segments.forEach(segment => {
    if (!segment.speaker) return;
    
    const currentSpeaker = segment.speaker;
    
    if (lastSpeaker && lastSpeaker !== currentSpeaker) {
      // Track transitions between speakers
      if (!speakerTransitions[lastSpeaker]) {
        speakerTransitions[lastSpeaker] = {};
      }
      
      speakerTransitions[lastSpeaker][currentSpeaker] = 
        (speakerTransitions[lastSpeaker][currentSpeaker] || 0) + 1;
    }
    
    lastSpeaker = currentSpeaker;
  });
  
  // Create a mapping for speakers to merge
  const speakerMap = new Map<string, string>();
  
  // First, map each keeper speaker to itself
  speakersToKeep.forEach(speaker => {
    speakerMap.set(speaker, speaker);
  });
  
  // For non-keeper speakers, find the most similar keeper
  sortedSpeakers.forEach(speaker => {
    if (speakersToKeep.includes(speaker)) {
      return; // Skip keepers, they're already mapped
    }
    
    // Find the most similar keeper speaker
    let bestMatch = speakersToKeep[0]; // Default to first speaker
    let bestScore = -1;
    
    for (const keeper of speakersToKeep) {
      // Calculate similarity based on transitions
      let score = 0;
      
      // If they frequently transition to/from each other, they might be the same speaker
      // incorrectly split due to pauses or tone changes
      const transitionsTo = (speakerTransitions[speaker]?.[keeper] || 0);
      const transitionsFrom = (speakerTransitions[keeper]?.[speaker] || 0);
      score += transitionsTo + transitionsFrom;
      
      // Also consider segment duration patterns
      const durationSimilarity = Math.min(
        speakerStats[speaker].avgSegmentLength / Math.max(speakerStats[keeper].avgSegmentLength, 0.1),
        speakerStats[keeper].avgSegmentLength / Math.max(speakerStats[speaker].avgSegmentLength, 0.1)
      );
      
      score += durationSimilarity * 2;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = keeper;
      }
    }
    
    // Map to the best matching keeper
    speakerMap.set(speaker, bestMatch);
    console.log(`Merging speaker ${speaker} into ${bestMatch} (score: ${bestScore.toFixed(2)})`);
  });
  
  // 5. Apply the mapping to all segments
  const updatedSegments = segments.map(segment => ({
    ...segment,
    speaker: segment.speaker ? (speakerMap.get(segment.speaker) || segment.speaker) : segment.speaker
  }));
  
  return updatedSegments;
}

/**
 * Automatically merges similar speakers in transcription segments
 */
export function autoMergeSpeakers(segments: TranscriptSegment[], targetSpeakerCount: number): TranscriptSegment[] {
  if (!segments?.length) return [];
  
  // Get all unique speakers
  const speakers = new Set<string>();
  for (const segment of segments) {
    if (segment.speaker) {
      speakers.add(segment.speaker);
    }
  }
  
  // If we already have fewer speakers than target, no need to merge
  const speakerArray = Array.from(speakers);
  if (speakerArray.length <= targetSpeakerCount) {
    return segments;
  }
  
  // Calculate statistics for each speaker
  interface SpeakerStats {
    totalWords: number;
    averageWordsPerSegment: number;
    segmentCount: number;
    totalDuration: number;
    averageDuration: number;
    wordFrequencies: Record<string, number>;
  }
  
  const speakerStats: Record<string, SpeakerStats> = {};
  
  for (const speaker of speakerArray) {
    const speakerSegments = segments.filter(s => s.speaker === speaker);
    
    const totalWords = speakerSegments.reduce((sum, segment) => {
      return sum + (segment.text.split(/\s+/).filter(Boolean).length);
    }, 0);
    
    const totalDuration = speakerSegments.reduce((sum, segment) => {
      return sum + ((segment.end || 0) - (segment.start || 0));
    }, 0);
    
    // Calculate word frequencies (simple bag of words)
    const wordFrequencies: Record<string, number> = {};
    for (const segment of speakerSegments) {
      const words = segment.text.toLowerCase()
        .replace(/[,.?!:;()\[\]{}'"]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2); // Filter out short words
      
      for (const word of words) {
        wordFrequencies[word] = (wordFrequencies[word] || 0) + 1;
      }
    }
    
    speakerStats[speaker] = {
      totalWords,
      averageWordsPerSegment: totalWords / speakerSegments.length,
      segmentCount: speakerSegments.length,
      totalDuration,
      averageDuration: totalDuration / speakerSegments.length,
      wordFrequencies
    };
  }
  
  // Calculate similarity between speakers
  interface SpeakerPair {
    speaker1: string;
    speaker2: string;
    similarity: number;
  }
  
  const speakerPairs: SpeakerPair[] = [];
  
  for (let i = 0; i < speakerArray.length; i++) {
    for (let j = i + 1; j < speakerArray.length; j++) {
      const speaker1 = speakerArray[i];
      const speaker2 = speakerArray[j];
      const stats1 = speakerStats[speaker1];
      const stats2 = speakerStats[speaker2];
      
      // Calculate jaccard similarity of word usage
      const words1 = Object.keys(stats1.wordFrequencies);
      const words2 = Object.keys(stats2.wordFrequencies);
      const commonWords = words1.filter(word => words2.includes(word));
      const vocabularySimilarity = commonWords.length / (words1.length + words2.length - commonWords.length);
      
      // Calculate similarity in speaking style metrics
      const durationSimilarity = 1 - Math.abs(stats1.averageDuration - stats2.averageDuration) / 
                                 Math.max(stats1.averageDuration, stats2.averageDuration);
      
      const wordsSimilarity = 1 - Math.abs(stats1.averageWordsPerSegment - stats2.averageWordsPerSegment) /
                              Math.max(stats1.averageWordsPerSegment, stats2.averageWordsPerSegment);
      
      // Calculate a weighted similarity score
      const similarity = (
        vocabularySimilarity * 0.6 + 
        durationSimilarity * 0.2 + 
        wordsSimilarity * 0.2
      );
      
      speakerPairs.push({
        speaker1,
        speaker2,
        similarity
      });
    }
  }
  
  // Sort by similarity (highest first)
  speakerPairs.sort((a, b) => b.similarity - a.similarity);
  
  // Create speaker mapping
  const speakerMapping: Record<string, string> = {};
  speakerArray.forEach(speaker => {
    speakerMapping[speaker] = speaker;
  });
  
  // Iteratively merge the most similar speakers until we reach the target count
  let currentSpeakerCount = speakerArray.length;
  for (const pair of speakerPairs) {
    if (currentSpeakerCount <= targetSpeakerCount) {
      break;
    }
    
    const { speaker1, speaker2 } = pair;
    
    // Find the root speakers (in case they've already been merged)
    const root1 = findRootSpeaker(speakerMapping, speaker1);
    const root2 = findRootSpeaker(speakerMapping, speaker2);
    
    // If they're not already merged, merge them
    if (root1 !== root2) {
      // Choose which speaker to keep based on segment count
      const keepSpeaker = speakerStats[root1].segmentCount >= speakerStats[root2].segmentCount ? root1 : root2;
      const mergeSpeaker = keepSpeaker === root1 ? root2 : root1;
      
      // Update the mapping
      speakerMapping[mergeSpeaker] = keepSpeaker;
      
      // Decrement the speaker count
      currentSpeakerCount--;
    }
  }
  
  // Apply the mapping to create new segments
  return segments.map(segment => {
    if (!segment.speaker) return segment;
    
    const rootSpeaker = findRootSpeaker(speakerMapping, segment.speaker);
    return {
      ...segment,
      speaker: rootSpeaker
    };
  });
}

/**
 * Helper function to find the root speaker in the mapping
 */
function findRootSpeaker(speakerMapping: Record<string, string>, speaker: string): string {
  let current = speaker;
  while (speakerMapping[current] !== current) {
    current = speakerMapping[current];
  }
  return current;
}
