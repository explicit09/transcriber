import { useState, useMemo } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TranscriptionResultProps {
  transcriptionText: string;
  fileName: string;
  onNewTranscription: () => void;
}

export default function TranscriptionResult({ 
  transcriptionText, 
  fileName,
  onNewTranscription 
}: TranscriptionResultProps) {
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);

  // Parse and format the transcript with speaker information
  const formattedTranscript = useMemo(() => {
    // Check if transcript contains speaker information
    const hasSpeakerLabels = transcriptionText.includes('Speaker ') && transcriptionText.includes(':');
    
    if (!hasSpeakerLabels) {
      return { lines: transcriptionText.split('\n'), hasSpeakerLabels: false };
    }
    
    // Process the transcript with speaker labels
    const lines = transcriptionText.split('\n').filter(line => line.trim() !== '');
    
    // Create a map of speakers to colors for consistent coloring
    const speakers = new Set<string>();
    lines.forEach(line => {
      const speakerMatch = line.match(/^(?:\[\d\d:\d\d\]\s+)?([^:]+):/);
      if (speakerMatch && speakerMatch[1]) {
        speakers.add(speakerMatch[1].trim());
      }
    });
    
    // Define speaker colors
    const speakerColors = [
      { bg: 'bg-blue-100', text: 'text-blue-800' },
      { bg: 'bg-green-100', text: 'text-green-800' },
      { bg: 'bg-purple-100', text: 'text-purple-800' },
      { bg: 'bg-amber-100', text: 'text-amber-800' },
      { bg: 'bg-rose-100', text: 'text-rose-800' },
      { bg: 'bg-cyan-100', text: 'text-cyan-800' },
      { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    ];
    
    const speakerColorMap = new Map<string, typeof speakerColors[0]>();
    Array.from(speakers).forEach((speaker, index) => {
      speakerColorMap.set(speaker, speakerColors[index % speakerColors.length]);
    });
    
    return { 
      lines, 
      hasSpeakerLabels: true, 
      speakerColorMap
    };
  }, [transcriptionText]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(transcriptionText);
      setHasCopied(true);
      toast({
        title: "Copied!",
        description: "Text copied to clipboard.",
        duration: 2000
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setHasCopied(false);
      }, 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy text to clipboard.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadText = () => {
    const filename = `${fileName.split('.')[0]}_transcript.txt`;
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(transcriptionText));
    element.setAttribute('download', filename);
    
    element.style.display = 'none';
    document.body.appendChild(element);
    
    element.click();
    
    document.body.removeChild(element);
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Transcription Result</h3>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyText}
            className={hasCopied ? "bg-green-500 text-white hover:bg-green-600" : ""}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            {hasCopied ? "Copied!" : "Copy"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadText}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
        </div>
      </div>
      
      <div className="bg-gray-50 rounded-md border border-gray-200 p-4 max-h-96 overflow-y-auto">
        {formattedTranscript.hasSpeakerLabels ? (
          <div className="space-y-4">
            {formattedTranscript.lines.map((line, index) => {
              // Match timestamp and speaker
              const timeMatch = line.match(/^\[(\d\d:\d\d)\]/);
              const time = timeMatch ? timeMatch[1] : null;
              
              // Extract speaker and text
              const speakerMatch = line.match(/^(?:\[\d\d:\d\d\]\s+)?([^:]+):(.*)/);
              
              if (speakerMatch) {
                const speaker = speakerMatch[1].trim();
                const text = speakerMatch[2].trim();
                const colorClass = formattedTranscript.speakerColorMap?.get(speaker);
                
                return (
                  <div key={index} className="pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      {time && (
                        <span className="text-xs font-mono text-gray-500">{time}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass?.bg} ${colorClass?.text}`}>
                        {speaker}
                      </span>
                    </div>
                    <p className="ml-6 text-gray-800">{text}</p>
                  </div>
                );
              }
              
              // Just a regular line without speaker information
              return (
                <p key={index} className="text-gray-700">
                  {line}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-700 whitespace-pre-line">
            {transcriptionText}
          </p>
        )}
      </div>
      
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          onClick={onNewTranscription}
        >
          Transcribe another file
        </Button>
      </div>
    </div>
  );
}
