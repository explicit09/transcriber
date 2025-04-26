import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

interface ProcessingStateProps {
  progress: number;
  isProcessing: boolean;
  timePassed?: number;
}

export default function ProcessingState({ progress, isProcessing, timePassed = 0 }: ProcessingStateProps) {
  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Dynamic message based on time elapsed
  const getMessage = () => {
    if (timePassed < 10) {
      return "Converting speech to text. This may take a moment...";
    } else if (timePassed < 30) {
      return "Still processing... this might take a little longer for larger files.";
    } else {
      return "Processing large audio file. This may take several minutes.";
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">Processing audio...</h3>
        <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} className="w-full h-2.5 bg-gray-200" />
      <div className="mt-2 text-sm text-gray-500 flex items-center">
        <Loader2 className="h-4 w-4 mr-1 animate-spin text-gray-400" />
        <span>{getMessage()}</span>
      </div>
      {timePassed > 5 && (
        <div className="mt-2 text-xs text-gray-400 text-right">
          Time elapsed: {formatTime(timePassed)}
        </div>
      )}
    </div>
  );
}
