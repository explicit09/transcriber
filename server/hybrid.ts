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
    assemblyResult.structuredTranscript.segments,
    options.numSpeakers
  );
  
  console.log(`Created ${hybridSegments.length} hybrid segments`);
  
  // Create metadata combining the best of both worlds
  const metadata = {
    speakerCount: assemblyResult.structuredTranscript.metadata?.speakerCount || 0,
    duration: openaiResult.duration || assemblyResult.duration,
    language: openaiResult.language || assemblyResult.language
  };
  
  // Merge consecutive segments from the same speaker
  const mergedSegments = mergeConsecutiveSegments(hybridSegments);
  console.log(`Merged ${hybridSegments.length} segments into ${mergedSegments.length} segments`);
  
  // Create the hybrid structured transcript
  const structuredTranscript: StructuredTranscript = {
    segments: mergedSegments,
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
 * Merge consecutive segments from the same speaker
 * This reduces the "choppiness" of the transcript by combining adjacent segments
 * from the same speaker into longer segments
 */
function mergeConsecutiveSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (!segments.length) return [];
  
  const mergedSegments: TranscriptSegment[] = [];
  let currentSegment = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    
    // If this segment is from the same speaker and close in time to the previous one, merge them
    if (segment.speaker === currentSegment.speaker) {
      // Add a small buffer (0.5 seconds) to allow for slight gaps between segments
      const timeGap = segment.start - currentSegment.end;
      
      if (timeGap < 0.5) {
        // Merge the text with a space
        currentSegment.text += ' ' + segment.text;
        // Extend the end time
        currentSegment.end = segment.end;
        continue;
      }
    }
    
    // If we get here, this segment is from a different speaker or too far apart in time
    // So add the current segment to our results and start a new one
    mergedSegments.push(currentSegment);
    currentSegment = { ...segment };
  }
  
  // Don't forget to add the last segment
  mergedSegments.push(currentSegment);
  
  return mergedSegments;
}

/**
 * Normalize speaker count by merging similar speakers
 * This is useful when AssemblyAI over-detects speakers
 */
function normalizeHybridSpeakers(
  segments: TranscriptSegment[],
  targetSpeakerCount: number
): TranscriptSegment[] {
  if (!segments.length) return [];
  
  // Count current speakers
  const speakerCounts: Record<string, number> = {};
  segments.forEach(segment => {
    if (!segment.speaker) return;
    
    if (!speakerCounts[segment.speaker]) {
      speakerCounts[segment.speaker] = 0;
    }
    speakerCounts[segment.speaker]++;
  });
  
  // Get current speakers and their segment counts
  const speakers = Object.keys(speakerCounts);
  const currentSpeakerCount = speakers.length;
  
  console.log(`Speaker distribution: ${JSON.stringify(speakerCounts)}`);
  
  // If we already have the target number of speakers or fewer, just return the segments
  if (currentSpeakerCount <= targetSpeakerCount) {
    console.log(`Current speaker count (${currentSpeakerCount}) <= target (${targetSpeakerCount}), no merging needed`);
    return segments;
  }
  
  // Sort speakers by frequency (most frequent first)
  const sortedSpeakers = speakers.sort((a, b) => speakerCounts[b] - speakerCounts[a]);
  
  // Keep the top N most common speakers
  const keptSpeakers = sortedSpeakers.slice(0, targetSpeakerCount);
  
  // Map minor speakers to the closest major speaker
  // For simplicity, we'll merge all minor speakers into the least frequent major speaker
  const leastFrequentMajorSpeaker = keptSpeakers[keptSpeakers.length - 1];
  
  console.log(`Keeping top ${targetSpeakerCount} speakers: ${keptSpeakers.join(', ')}`);
  console.log(`Merging minor speakers into ${leastFrequentMajorSpeaker}`);
  
  // Create a mapping for all speakers
  const speakerMapping: Record<string, string> = {};
  
  // Major speakers map to themselves
  keptSpeakers.forEach(speaker => {
    speakerMapping[speaker] = speaker;
  });
  
  // Minor speakers map to the least frequent major speaker
  sortedSpeakers.slice(targetSpeakerCount).forEach(speaker => {
    speakerMapping[speaker] = leastFrequentMajorSpeaker;
    console.log(`Mapping ${speaker} -> ${leastFrequentMajorSpeaker}`);
  });
  
  // Apply the mapping to all segments
  const normalizedSegments = segments.map(segment => {
    if (segment.speaker && speakerMapping[segment.speaker]) {
      return {
        ...segment,
        speaker: speakerMapping[segment.speaker]
      };
    }
    return segment;
  });
  
  return normalizedSegments;
}

/**
 * Align segments from OpenAI and AssemblyAI to create improved segments
 * This function tries to match AssemblyAI speaker labels with OpenAI segments
 * based on their time overlap
 */
function alignAndCombineSegments(
  openaiSegments: TranscriptSegment[],
  assemblySegments: TranscriptSegment[],
  targetSpeakerCount?: number
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
  
  // Normalize to target speaker count if provided, default to 3 which is typical
  return normalizeHybridSpeakers(hybridSegments, targetSpeakerCount || 3);
}