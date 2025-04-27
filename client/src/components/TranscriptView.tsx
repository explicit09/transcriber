import React from 'react';
import { StructuredTranscript, Transcription } from '@shared/schema';

interface TranscriptViewProps {
  transcription: Transcription;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TranscriptView({ transcription }: TranscriptViewProps) {
  // If we have structured transcript with segments, render with timestamps
  if (transcription.structuredTranscript && 
      typeof transcription.structuredTranscript === 'object' && 
      Array.isArray(transcription.structuredTranscript.segments)) {
    
    const segments = transcription.structuredTranscript.segments;
    
    return (
      <div className="space-y-4 max-h-[500px] overflow-y-auto p-4 border rounded-md">
        {segments.map((segment, index) => (
          <div 
            key={`${segment.start}-${index}`} 
            className="pb-3 border-b border-gray-100 last:border-0"
          >
            <div className="flex items-start">
              <span className="text-xs font-mono bg-gray-100 rounded px-1 py-0.5 text-gray-600 mr-2 mt-1">
                {formatTime(segment.start)}
              </span>
              <div className="flex-1">
                {segment.speaker && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-1">
                    {segment.speaker}
                  </span>
                )}
                <p className="text-gray-800">{segment.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Otherwise, just render the plain text
  return (
    <div className="max-h-[500px] overflow-y-auto p-4 border rounded-md">
      <pre className="whitespace-pre-wrap text-gray-800">{transcription.text}</pre>
    </div>
  );
}