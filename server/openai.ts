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
  let segments: EnhancedTranscriptSegment[] = transcription.segments
    ? (transcription.segments as WhisperSegment[])
        .map(s => ({ 
          start: s.start, 
          end: s.end, 
          text: s.text.trim(), 
          speaker: undefined,
          confidence: s.confidence ?? 1.0
        }))
        .sort((a, b) => a.start - b.start) // Ensure segments are ordered by time
    : [];

  // Merge very short segments (less than 0.3 seconds) with adjacent segments
  segments = segments.reduce((acc: EnhancedTranscriptSegment[], curr) => {
    if (acc.length === 0) return [curr];
    
    const prev = acc[acc.length - 1];
    if (curr.start - prev.end < 0.3 && curr.start >= prev.start) {
      prev.end = curr.end;
      prev.text = `${prev.text} ${curr.text}`;
      prev.confidence = Math.min(prev.confidence, curr.confidence);
      return acc;
    }
    
    return [...acc, curr];
  }, []);

  let speakerCount = 1; // Default to 1 speaker

  if (options.enableSpeakerDiarization && segments.length) {
    // Pass the original segments and the full text to the diarization process
    const { segments: diarizedSegments, speakerCount: count } = await processSpeakerDiarization(
      segments as TranscriptSegment[], 
      text
    );
    
    // Post-process diarized segments
    const processedSegments = (diarizedSegments as EnhancedTranscriptSegment[]).map((segment, i, arr) => {
      // Keep same speaker if segment gap is very small (< 0.3s) and confidence is high
      if (i > 0 && 
          segment.start - arr[i-1].end < 0.3 && 
          segment.confidence > 0.8 && 
          arr[i-1].confidence > 0.8) {
        segment.speaker = arr[i-1].speaker;
      }
      return segment;
    });

    speakerCount = count;
    segments.length = 0;
    segments.push(...processedSegments);
  }

  // Handle potential overlapping segments
  segments = segments.reduce((acc: EnhancedTranscriptSegment[], curr) => {
    if (acc.length === 0) return [curr];
    
    const prev = acc[acc.length - 1];
    if (curr.start < prev.end) {
      // If segments overlap and have different speakers, adjust timing
      if (curr.speaker !== prev.speaker) {
        const midpoint = (curr.start + prev.end) / 2;
        prev.end = midpoint;
        curr.start = midpoint;
      }
    }
    
    return [...acc, curr];
  }, []);

  const structuredTranscript: StructuredTranscript = {
    segments: segments as TranscriptSegment[],
    metadata: { speakerCount, duration: duration || 0, language },
  };

  return { text, structuredTranscript, duration, language };
}

async function processSpeakerDiarization(timestampedSegments: TranscriptSegment[], fullText: string | null): Promise<{ segments: TranscriptSegment[]; speakerCount: number }> {
  const segmentsText = timestampedSegments.map(s => `[${formatTime(s.start)} - ${formatTime(s.end)}]: ${s.text}`).join('\n');
  const safeFullText = fullText || segmentsText;

  console.log('--- Calling GPT-4 for Diarization ---');
  console.log('Segments Text Snippet:', segmentsText.substring(0, 200) + '...');
  console.log('Full Text Snippet:', safeFullText ? safeFullText.substring(0, 200) + '...' : 'N/A');

  const response = await limiter.schedule(() =>
    withRetry(() => openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: `You are an expert at speaker diarization for conversational audio. Your task is to identify different speakers in the transcript.

Rules for speaker identification:
1. Look for clear speaker transitions through:
   - Question and answer patterns
   - Agreements/disagreements
   - Interjections and interruptions
   - Direct addressing of others
   - Topic shifts and turn-taking
2. Pay attention to:
   - Unique speech patterns and filler words per speaker
   - Consistent speaking styles and vocabulary
   - References to self ("I", "my") or others ("you", "they")
   - Response patterns (e.g., "Yeah", "Okay", "Thank you")
3. Consider conversation dynamics:
   - When someone asks a question, the answer likely comes from a different speaker
   - Side comments or interjections often indicate a different speaker
   - Multiple people agreeing/disagreeing simultaneously
4. Label speakers consistently as "Speaker 1", "Speaker 2", etc.
5. For informal conversations:
   - Track overlapping speech and interruptions
   - Note when speakers finish each other's sentences
   - Identify group dynamics (e.g., moderator vs participants)

Output format:
- Return a JSON object with fields 'segments' (array) and 'speakerCount' (number).
- Each segment must include: start (number), end (number), text (string), and speaker (string).
- Maintain exact input segment count, only adding speaker labels.
- Example: { "segments": [{"start": 0, "end": 5, "text": "Hello", "speaker": "Speaker 1"}], "speakerCount": 1 }` 
        },
        { 
          role: 'user', 
          content: `Analyze this conversation transcript for different speakers and return a JSON response.

This is an informal conversation between multiple people. Please identify speaker changes by analyzing speech patterns, turn-taking, and conversation dynamics.

Transcript with timestamps:
${segmentsText}

Full text for context:
${safeFullText}` 
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }))
  );

  console.log('--- GPT-4 Diarization Response ---');
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
