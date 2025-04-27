import React from 'react';
import { TranscriptSegment } from '@shared/schema';

interface SpeakerLabelsProps {
  segments: TranscriptSegment[];
}

export default function SpeakerLabels({ segments }: SpeakerLabelsProps) {
  // Get unique speakers
  const speakers = Array.from(new Set(
    segments
      .filter(segment => segment.speaker)
      .map(segment => segment.speaker)
  ));

  // Define speaker colors
  const speakerColors = [
    "bg-blue-100 text-blue-800",
    "bg-green-100 text-green-800",
    "bg-purple-100 text-purple-800",
    "bg-amber-100 text-amber-800",
    "bg-red-100 text-red-800",
    "bg-indigo-100 text-indigo-800",
  ];

  // If no speakers, don't render anything
  if (speakers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 bg-gray-50 p-3 rounded-md border">
      <span className="text-sm text-gray-500 font-medium mr-2">Speakers:</span>
      {speakers.map((speaker, index) => (
        <span 
          key={speaker} 
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            speaker.includes("1") ? "bg-blue-100 text-blue-800" :
            speaker.includes("2") ? "bg-green-100 text-green-800" :
            speaker.includes("3") ? "bg-purple-100 text-purple-800" :
            speaker.includes("4") ? "bg-amber-100 text-amber-800" :
            speaker.includes("5") ? "bg-red-100 text-red-800" :
            "bg-indigo-100 text-indigo-800"
          }`}
        >
          {speaker}
        </span>
      ))}
      <span className="text-xs text-gray-500 ml-auto self-end">
        {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} detected
      </span>
    </div>
  );
}