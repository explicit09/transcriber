import { AssemblyAI } from 'assemblyai';
import fs from 'fs';
import { StructuredTranscript, TranscriptSegment } from '@shared/schema';

// Initialize the AssemblyAI client with your API key
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || ''
});

/**
 * Transcribe audio with speaker diarization using AssemblyAI
 * 
 * @param audioFilePath Path to the audio file
 * @param options Configuration options for transcription
 * @returns Transcript with speaker diarization
 */
export async function transcribeWithAssemblyAI(
  audioFilePath: string,
  options: {
    speakerLabels?: boolean;
    numSpeakers?: number;
    language?: string;
  } = {}
): Promise<{
  text: string;
  structuredTranscript: StructuredTranscript;
  duration?: number;
  language?: string;
}> {
  try {
    console.log(`Transcribing ${audioFilePath} with AssemblyAI`);
    
    // Configure transcription parameters
    const transcribeParams: any = {
      audio: fs.createReadStream(audioFilePath),
      speaker_labels: options.speakerLabels !== false, // Enable by default
    };
    
    // Add optional parameters if specified
    if (options.numSpeakers && options.numSpeakers > 0) {
      transcribeParams.speakers_expected = options.numSpeakers;
    }
    
    if (options.language) {
      transcribeParams.language_code = options.language;
    }
    
    // Start the transcription job with AssemblyAI
    console.log("Starting AssemblyAI transcription job with parameters:", 
      JSON.stringify({
        speaker_labels: transcribeParams.speaker_labels,
        speakers_expected: transcribeParams.speakers_expected,
        language_code: transcribeParams.language_code
      })
    );
    
    // Submit the transcription request
    const transcript = await client.transcripts.transcribe(transcribeParams);
    
    console.log(`AssemblyAI transcription complete. Status: ${transcript.status}`);
    
    if (transcript.status !== 'completed') {
      throw new Error(`Transcription failed with status: ${transcript.status}`);
    }
    
    // Extract the full text
    const text = transcript.text || '';
    
    // Map AssemblyAI utterances to our transcript segment format
    let segments: TranscriptSegment[] = [];
    
    if (transcript.utterances && transcript.utterances.length > 0) {
      // Process utterances (speaker diarization results)
      segments = transcript.utterances.map((utterance: any) => ({
        start: utterance.start / 1000, // Convert from ms to seconds
        end: utterance.end / 1000, // Convert from ms to seconds
        text: utterance.text,
        speaker: `Speaker ${utterance.speaker}` // Format as "Speaker N"
      }));
      
      console.log(`Processed ${segments.length} segments with speaker diarization`);
      
      // Count unique speakers
      const speakers = new Set<string>();
      segments.forEach(segment => {
        if (segment.speaker) {
          speakers.add(segment.speaker);
        }
      });
      
      console.log(`Detected ${speakers.size} speakers: ${Array.from(speakers).join(', ')}`);
    } else if (transcript.words && transcript.words.length > 0) {
      // Fall back to words if no utterances
      console.log("No utterances found, constructing segments from words");
      
      // Group words into sentences (as rough segments)
      let currentStart = transcript.words[0].start / 1000;
      let currentEnd = transcript.words[0].end / 1000;
      let currentText = transcript.words[0].text;
      
      for (let i = 1; i < transcript.words.length; i++) {
        const word = transcript.words[i];
        const prev = transcript.words[i-1];
        
        // If there's a significant pause (> 1s), start a new segment
        if ((word.start - prev.end) > 1000) {
          segments.push({
            start: currentStart,
            end: currentEnd,
            text: currentText.trim(),
            speaker: 'Speaker 1' // Default when no speaker diarization
          });
          
          currentStart = word.start / 1000;
          currentText = word.text;
        } else {
          currentText += ' ' + word.text;
        }
        
        currentEnd = word.end / 1000;
      }
      
      // Add the final segment
      segments.push({
        start: currentStart,
        end: currentEnd,
        text: currentText.trim(),
        speaker: 'Speaker 1' // Default when no speaker diarization
      });
      
      console.log(`Constructed ${segments.length} segments from words (no speaker diarization)`);
    } else {
      // If neither utterances nor words are available, create a single segment
      console.log("No utterances or words found, creating a single segment");
      segments = [{
        start: 0,
        end: transcript.audio_duration || 0,
        text,
        speaker: 'Speaker 1'
      }];
    }
    
    // Create structured transcript
    const speakerCount = transcript.utterances ? 
      new Set(transcript.utterances.map((u: any) => `Speaker ${u.speaker}`)).size : 
      1;
    
    const structuredTranscript: StructuredTranscript = {
      segments,
      metadata: {
        speakerCount,
        duration: transcript.audio_duration ? transcript.audio_duration / 1000 : undefined,
        language: transcript.language_code
      }
    };
    
    return {
      text,
      structuredTranscript,
      duration: transcript.audio_duration ? transcript.audio_duration / 1000 : undefined,
      language: transcript.language_code
    };
  } catch (error: unknown) {
    console.error('AssemblyAI transcription error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AssemblyAI transcription failed: ${errorMessage}`);
  }
}

/**
 * Format a transcript as text with speaker labels
 * 
 * @param structuredTranscript The structured transcript with segments
 * @param includeTimestamps Whether to include timestamps in the output
 * @returns Formatted transcript text
 */
export function formatTranscriptText(
  structuredTranscript: StructuredTranscript,
  includeTimestamps: boolean = false
): string {
  if (!structuredTranscript.segments || structuredTranscript.segments.length === 0) {
    return '';
  }
  
  // Group consecutive segments from the same speaker
  const formattedSegments: string[] = [];
  let currentSpeaker = '';
  let currentSegmentStart = 0;
  let currentTexts: string[] = [];
  
  structuredTranscript.segments.forEach(segment => {
    const speaker = segment.speaker || 'Unknown Speaker';
    
    // If this is the same speaker as before, accumulate the text
    if (speaker === currentSpeaker) {
      currentTexts.push(segment.text);
    } else {
      // If we have accumulated text for a previous speaker, add it to our output
      if (currentTexts.length > 0) {
        const timePrefix = includeTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
        formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
      }
      
      // Start a new speaker group
      currentSpeaker = speaker;
      currentSegmentStart = segment.start;
      currentTexts = [segment.text];
    }
  });
  
  // Don't forget the last group
  if (currentTexts.length > 0) {
    const timePrefix = includeTimestamps ? `[${formatTime(currentSegmentStart)}] ` : '';
    formattedSegments.push(`${timePrefix}${currentSpeaker}: ${currentTexts.join(' ')}`);
  }
  
  return formattedSegments.join('\n\n');
}

/**
 * Format time in seconds to MM:SS format
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}