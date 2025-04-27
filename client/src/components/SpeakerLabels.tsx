import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Define color options for different speakers
const SPEAKER_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
];

interface Segment {
  text: string;
  start?: number;
  end?: number;
  speaker?: string;
}

interface SpeakerLabelsProps {
  segments: Segment[];
}

export default function SpeakerLabels({ segments }: SpeakerLabelsProps) {
  // Generate speaker colors and count their occurrences
  const { speakerColors, speakerCounts } = useMemo(() => {
    const colorMap: Record<string, typeof SPEAKER_COLORS[0]> = {};
    const countMap: Record<string, number> = {};
    
    // Extract unique speakers and count their occurrences
    segments.forEach(segment => {
      if (segment.speaker) {
        if (!countMap[segment.speaker]) {
          countMap[segment.speaker] = 0;
        }
        countMap[segment.speaker]++;
      }
    });
    
    // Assign colors to speakers
    Object.keys(countMap).forEach((speaker, index) => {
      colorMap[speaker] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
    
    return { speakerColors: colorMap, speakerCounts: countMap };
  }, [segments]);
  
  // Get unique speakers sorted by number of occurrences (descending)
  const speakers = useMemo(() => {
    return Object.keys(speakerCounts)
      .sort((a, b) => speakerCounts[b] - speakerCounts[a]);
  }, [speakerCounts]);
  
  // If no speakers found, don't render anything
  if (speakers.length === 0) {
    return null;
  }
  
  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4" />
        <h3 className="font-semibold">Speakers</h3>
        <Badge variant="outline">{speakers.length}</Badge>
      </div>
      
      <div className="flex flex-wrap gap-2 mt-3">
        {speakers.map(speaker => {
          const color = speakerColors[speaker];
          return (
            <div 
              key={speaker}
              className={`px-3 py-1.5 rounded-full ${color.bg} ${color.text} ${color.border} border flex items-center gap-1.5`}
            >
              <span className="font-medium">{speaker}</span>
              <Badge variant="secondary" className="text-xs">
                {speakerCounts[speaker]}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
} 