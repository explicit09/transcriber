import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TranscriptSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

interface TranscriptionResultProps {
  structuredTranscript: TranscriptSegment[];
  fileName: string;
  onNewTranscription: () => void;
}

export default function TranscriptionResult({
  structuredTranscript,
  fileName,
  onNewTranscription
}: TranscriptionResultProps) {
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopyText = async () => {
    try {
      const fullText = structuredTranscript.map(seg => `${seg.speaker}: ${seg.text}`).join("\n\n");
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
    const fullText = structuredTranscript.map(seg => `${seg.speaker}: ${seg.text}`).join("\n\n");
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

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Transcription Result</h3>
        <div className="flex space-x-2">
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

      <div className="bg-gray-50 rounded-md border border-gray-200 p-4 max-h-96 overflow-y-auto space-y-4">
        {structuredTranscript.map((seg, index) => (
          <div key={index} className="pb-4 mb-3 border-b border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-gray-500">[{formatTime(seg.start)}]</span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {seg.speaker}
              </span>
            </div>
            <p className="ml-6 text-gray-800 whitespace-pre-line">{seg.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onNewTranscription}>
          Transcribe another file
        </Button>
      </div>
    </div>
  );
}