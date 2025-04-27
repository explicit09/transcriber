import { useState } from "react";
import { Copy, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import SpeakerManager from "./SpeakerManager";

interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

interface TranscriptionResultProps {
  structuredTranscript?: TranscriptSegment[];
  transcriptionText?: string;
  fileName: string;
  onNewTranscription: () => void;
  transcriptionId?: number;
}

export default function TranscriptionResult({
  structuredTranscript,
  transcriptionText,
  fileName,
  onNewTranscription,
  transcriptionId
}: TranscriptionResultProps) {
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);
  const [showSpeakerManager, setShowSpeakerManager] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Check if we have multiple speakers
  const hasMultipleSpeakers = structuredTranscript && 
    structuredTranscript.length > 0 && 
    new Set(structuredTranscript.map(seg => seg.speaker)).size > 1;

  const handleCopyText = async () => {
    try {
      let fullText;
      if (structuredTranscript && structuredTranscript.length > 0) {
        fullText = structuredTranscript.map(seg => `${seg.speaker}: ${seg.text}`).join("\n\n");
      } else {
        fullText = transcriptionText || "";
      }
      
      await navigator.clipboard.writeText(fullText);
      setHasCopied(true);
      toast({
        title: "Copied!",
        description: "Text copied to clipboard.",
        duration: 2000
      });
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy text to clipboard.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadText = () => {
    let fullText;
    if (structuredTranscript && structuredTranscript.length > 0) {
      fullText = structuredTranscript.map(seg => `${seg.speaker}: ${seg.text}`).join("\n\n");
    } else {
      fullText = transcriptionText || "";
    }
    
    const element = document.createElement("a");
    element.setAttribute("href", 'data:text/plain;charset=utf-8,' + encodeURIComponent(fullText));
    element.setAttribute("download", `${fileName.split('.')[0]}_transcript.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  
  const handleSpeakersUpdated = () => {
    // Increment the refresh key to trigger a refetch of the transcript
    setRefreshKey(prev => prev + 1);
    // Optionally close the speaker manager
    // setShowSpeakerManager(false);
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Transcription Result</h3>
        <div className="flex space-x-2">
          {hasMultipleSpeakers && transcriptionId && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowSpeakerManager(!showSpeakerManager)}
              className={showSpeakerManager ? "bg-blue-100" : ""}
            >
              <Users className="h-4 w-4 mr-1.5" />
              {showSpeakerManager ? "Hide Speaker Manager" : "Manage Speakers"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleCopyText} className={hasCopied ? "bg-green-500 text-white hover:bg-green-600" : ""}>
            <Copy className="h-4 w-4 mr-1.5" />
            {hasCopied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="default" size="sm" onClick={handleDownloadText}>
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
        </div>
      </div>
      
      {showSpeakerManager && transcriptionId && (
        <SpeakerManager 
          transcriptionId={transcriptionId}
          structuredTranscript={{ segments: structuredTranscript }}
          onSpeakersUpdated={handleSpeakersUpdated}
        />
      )}

      <div className="bg-gray-50 rounded-md border border-gray-200 p-4 max-h-96 overflow-y-auto space-y-4">
        {structuredTranscript && structuredTranscript.length > 0 ? (
          structuredTranscript.map((seg, index) => (
            <div key={`${index}-${refreshKey}`} className="pb-4 mb-3 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-gray-500">[{formatTime(seg.start)}]</span>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {seg.speaker}
                </span>
              </div>
              <p className="ml-6 text-gray-800 whitespace-pre-line">{seg.text}</p>
            </div>
          ))
        ) : (
          <p className="text-gray-800 whitespace-pre-line">{transcriptionText}</p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onNewTranscription}>
          Transcribe another file
        </Button>
      </div>
    </div>
  );
}