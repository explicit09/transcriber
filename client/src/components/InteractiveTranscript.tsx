import { useState, useRef, useEffect } from "react";
import { StructuredTranscript } from "@shared/schema";
import AudioPlayer from "./AudioPlayer";
import NavigableTranscript from "./NavigableTranscript";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

interface InteractiveTranscriptProps {
  transcriptionId: number;
  structuredTranscript: StructuredTranscript;
  originalText: string;
  fileName: string;
}

export default function InteractiveTranscript({
  transcriptionId,
  structuredTranscript,
  originalText,
  fileName,
}: InteractiveTranscriptProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  // Get the audio URL for the transcription
  useEffect(() => {
    const fetchAudio = async () => {
      try {
        setIsLoading(true);
        // Construct the URL to the audio file API endpoint
        const url = `/api/transcriptions/${transcriptionId}/audio`;
        
        // Check if the endpoint is available
        const response = await fetch(url, { method: 'HEAD' });
        
        if (response.ok) {
          setAudioUrl(url);
        } else {
          setError("Audio file not available. The original audio may not be stored.");
        }
      } catch (err) {
        setError("Failed to load audio file.");
        console.error("Error fetching audio:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (transcriptionId) {
      fetchAudio();
    }
  }, [transcriptionId]);

  // Handle timestamp click from the transcript
  const handleTimestampClick = (time: number) => {
    // Access the seekTo method we added to the audio element
    if (audioPlayerRef.current && (audioPlayerRef.current as any).seekTo) {
      (audioPlayerRef.current as any).seekTo(time);
    }
  };

  // Handle time updates from the audio player
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  return (
    <Card className="p-4">
      <Tabs defaultValue="interactive" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="interactive">Interactive Transcript</TabsTrigger>
          <TabsTrigger value="plain">Plain Text</TabsTrigger>
        </TabsList>

        <TabsContent value="interactive" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-4">Loading audio...</div>
          ) : error ? (
            <div className="text-amber-600 bg-amber-50 p-4 rounded-md mb-4">
              {error}
              <p className="text-sm mt-2">
                You can still view the transcript with timestamps below.
              </p>
            </div>
          ) : (
            <AudioPlayer
              audioUrl={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              duration={structuredTranscript.metadata?.duration}
              ref={audioPlayerRef}
            />
          )}

          <div className="border rounded-md p-4 max-h-[500px] overflow-y-auto">
            <NavigableTranscript
              transcript={structuredTranscript}
              currentTime={currentTime}
              onTimestampClick={handleTimestampClick}
              highlightCurrentSegment={true}
            />
          </div>
        </TabsContent>

        <TabsContent value="plain">
          <div className="border rounded-md p-4 max-h-[500px] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm">{originalText}</pre>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
