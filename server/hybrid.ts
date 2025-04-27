import { transcribeAudioWithFeatures } from './openai';
import { transcribeWithAssemblyAI } from './assemblyai';
import { StructuredTranscript, TranscriptSegment } from '@shared/schema';

/**
 * Hybrid transcription that combines OpenAI's accurate text transcription 
 * with AssemblyAI's superior speaker diarization
 * 
 * @param audioFilePath Path to the audio file
 * @param options Configuration options for transcription
 * @returns Transcript with combined results
 */
export async function transcribeWithHybridApproach(
  audioFilePath: string,
  options: {
    enableTimestamps?: boolean;
    language?: string;
    numSpeakers?: number;
  } = {}
): Promise<{
  text: string;
  structuredTranscript: StructuredTranscript;
  duration?: number;
  language?: string;
}> {
  console.log('Starting hybrid transcription combining OpenAI and AssemblyAI');
  
  // Step 1: Run both transcription services in parallel to save time
  const [openaiResult, assemblyResult] = await Promise.all([
    transcribeAudioWithFeatures(audioFilePath, {
      enableTimestamps: options.enableTimestamps,
      language: options.language,
    }),
    transcribeWithAssemblyAI(audioFilePath, {
      speakerLabels: true,
      numSpeakers: options.numSpeakers,
      language: options.language,
    })
  ]);
  
  console.log('Received results from both OpenAI and AssemblyAI');
  console.log(`OpenAI segments: ${openaiResult.structuredTranscript.segments.length}`);
  console.log(`AssemblyAI segments: ${assemblyResult.structuredTranscript.segments.length}`);
  
  // Step 2: Take OpenAI's full transcript text (more accurate)
  const text = openaiResult.text;
  
  // Step 3: Use AssemblyAI's speaker diarization (better speaker detection)
  // But we'll need to align the segments to match OpenAI's timing
  
  const hybridSegments = alignAndCombineSegments(
    openaiResult.structuredTranscript.segments,
    assemblyResult.structuredTranscript.segments
  );
  
  console.log(`Created ${hybridSegments.length} hybrid segments`);
  
  // Create metadata combining the best of both worlds
  const metadata = {
    speakerCount: assemblyResult.structuredTranscript.metadata?.speakerCount || 0,
    duration: openaiResult.duration || assemblyResult.duration,
    language: openaiResult.language || assemblyResult.language
  };
  
  // Create the hybrid structured transcript
  const structuredTranscript: StructuredTranscript = {
    segments: hybridSegments,
    metadata
  };
  
  return {
    text,
    structuredTranscript,
    duration: openaiResult.duration || assemblyResult.duration,
    language: openaiResult.language || assemblyResult.language
  };
}

/**
 * Align segments from OpenAI and AssemblyAI to create improved segments
 * This function tries to match AssemblyAI speaker labels with OpenAI segments
 * based on their time overlap
 */
function alignAndCombineSegments(
  openaiSegments: TranscriptSegment[],
  assemblySegments: TranscriptSegment[]
): TranscriptSegment[] {
  if (!openaiSegments.length) return assemblySegments;
  if (!assemblySegments.length) return openaiSegments;
  
  // Create a copy of the openAI segments as our base
  const hybridSegments: TranscriptSegment[] = JSON.parse(JSON.stringify(openaiSegments));
  
  // Create a map of AssemblyAI speakers and their segments
  const speakerMap: Record<string, TranscriptSegment[]> = {};
  
  assemblySegments.forEach(segment => {
    if (!segment.speaker) return;
    
    if (!speakerMap[segment.speaker]) {
      speakerMap[segment.speaker] = [];
    }
    speakerMap[segment.speaker].push(segment);
  });
  
  // For each OpenAI segment, find the most likely speaker from AssemblyAI
  hybridSegments.forEach((segment, index) => {
    const start = segment.start;
    const end = segment.end;
    
    // Find all AssemblyAI segments that overlap with this segment
    const overlappingSegments: {
      speaker: string;
      overlapDuration: number;
    }[] = [];
    
    Object.entries(speakerMap).forEach(([speaker, segments]) => {
      segments.forEach(assemblySegment => {
        // Check if the segments overlap
        if (assemblySegment.end >= start && assemblySegment.start <= end) {
          // Calculate the overlap duration
          const overlapStart = Math.max(start, assemblySegment.start);
          const overlapEnd = Math.min(end, assemblySegment.end);
          const overlapDuration = overlapEnd - overlapStart;
          
          if (overlapDuration > 0) {
            overlappingSegments.push({
              speaker,
              overlapDuration
            });
          }
        }
      });
    });
    
    // Sort overlapping segments by overlap duration (descending)
    overlappingSegments.sort((a, b) => b.overlapDuration - a.overlapDuration);
    
    // Assign the speaker with the most overlap
    if (overlappingSegments.length > 0) {
      segment.speaker = overlappingSegments[0].speaker;
    } else {
      // If no overlap, try to infer from surrounding segments
      if (index > 0 && hybridSegments[index - 1].speaker) {
        segment.speaker = hybridSegments[index - 1].speaker;
      } else if (index < hybridSegments.length - 1 && hybridSegments[index + 1].speaker) {
        segment.speaker = hybridSegments[index + 1].speaker;
      } else {
        // Default to the first speaker found in AssemblyAI
        const speakers = Object.keys(speakerMap);
        if (speakers.length > 0) {
          segment.speaker = speakers[0];
        } else {
          segment.speaker = 'Speaker 1';
        }
      }
    }
  });
  
  return hybridSegments;
}