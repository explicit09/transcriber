import { useState, useEffect, useRef } from "react";
import { Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StructuredTranscript, TranscriptSegment } from "@shared/schema";

interface NavigableTranscriptProps {
  transcript: StructuredTranscript;
  currentTime?: number;
  onTimestampClick: (time: number) => void;
  highlightCurrentSegment?: boolean;
}

export default function NavigableTranscript({
  transcript,
  currentTime = 0,
  onTimestampClick,
  highlightCurrentSegment = true,
}: NavigableTranscriptProps) {
  const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Format time as MM:SS
  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Find the active segment based on current playback time
  useEffect(() => {
    if (!transcript || !transcript.segments || !highlightCurrentSegment) return;

    const activeIndex = transcript.segments.findIndex(
      (segment, index, segments) => {
        // Check if current time is within this segment
        if (currentTime >= segment.start && currentTime <= segment.end) {
          return true;
        }
        // For gaps between segments, assign to the next segment
        if (
          index > 0 &&
          currentTime > segments[index - 1].end &&
          currentTime < segment.start
        ) {
          return true;
        }
        return false;
      }
    );

    setActiveSegmentId(activeIndex >= 0 ? activeIndex : null);

    // Scroll active segment into view (with smooth behavior)
    if (activeIndex >= 0 && segmentRefs.current[activeIndex]) {
      segmentRefs.current[activeIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentTime, transcript, highlightCurrentSegment]);

  // Group segments by speaker for better visualization
  const groupedSegments = transcript?.segments?.reduce<{
    [key: string]: TranscriptSegment[];
  }>((groups, segment) => {
    const speaker = segment.speaker || "Unknown Speaker";
    if (!groups[speaker]) {
      groups[speaker] = [];
    }
    groups[speaker].push(segment);
    return groups;
  }, {});

  // Get unique speakers and assign colors
  const speakers = Object.keys(groupedSegments || {});
  const speakerColors: Record<string, string> = {};
  const colorClasses = [
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-green-100 text-green-800 border-green-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-amber-100 text-amber-800 border-amber-200",
    "bg-red-100 text-red-800 border-red-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200",
  ];

  speakers.forEach((speaker, index) => {
    speakerColors[speaker] = colorClasses[index % colorClasses.length];
  });

  if (!transcript || !transcript.segments || transcript.segments.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        No transcript segments available
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-y-auto">
      {/* Display segments chronologically */}
      {transcript.segments.map((segment, index) => {
        const isActive = index === activeSegmentId;
        const speaker = segment.speaker || "Unknown Speaker";
        const colorClass = speakerColors[speaker] || "bg-gray-100 text-gray-800 border-gray-200";

        return (
          <div
            key={`segment-${index}`}
            ref={(el) => (segmentRefs.current[index] = el)}
            className={`p-3 rounded-md transition-all ${isActive ? "bg-blue-50 border border-blue-200" : ""}`}
          >
            <div className="flex items-start justify-between mb-2">
              <Badge
                variant="outline"
                className={`text-xs ${colorClass} cursor-pointer hover:opacity-80`}
                onClick={() => onTimestampClick(segment.start)}
              >
                <User className="h-3 w-3 mr-1" />
                {speaker}
              </Badge>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-gray-500 hover:text-blue-600"
                onClick={() => onTimestampClick(segment.start)}
              >
                <Clock className="h-3 w-3 mr-1" />
                {formatTime(segment.start)}
              </Button>
            </div>
            
            <p className="text-gray-700 whitespace-pre-line">{segment.text}</p>
          </div>
        );
      })}
    </div>
  );
}
