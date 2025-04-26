import { useState, useEffect } from "react";
import UploadArea from "./UploadArea";
import ProcessingState from "./ProcessingState";
import FileDetails from "./FileDetails";
import TranscriptionResult from "./TranscriptionResult";
import ErrorState from "./ErrorState";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Type definition for transcription data from the API
interface Transcription {
  id: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: string;
  text: string | null;
  error: string | null;
}

type FileInfo = {
  id?: number;
  name: string;
  size: number;
  type: string;
  file?: File;
};

export default function TranscriptionContainer() {
  const [currentFile, setCurrentFile] = useState<FileInfo | null>(null);
  const [transcriptionId, setTranscriptionId] = useState<number | null>(null);
  const [view, setView] = useState<"upload" | "processing" | "result" | "error">("upload");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { toast } = useToast();

  // For progress simulation
  const [progress, setProgress] = useState(0);
  const [timePassed, setTimePassed] = useState(0);
  
  // Query to get transcription status and result
  const { data: transcription, isLoading } = useQuery<Transcription>({
    queryKey: [transcriptionId ? `/api/transcriptions/${transcriptionId}` : null],
    enabled: !!transcriptionId && view === "processing",
    refetchInterval: view === "processing" ? 1000 : false,
  });
  
  // Watch for status changes
  useEffect(() => {
    if (!transcription) return;
    
    if (transcription.status === "completed") {
      setView("result");
    } else if (transcription.status === "error") {
      setErrorMessage(transcription.error || "Failed to transcribe audio");
      setView("error");
    }
  }, [transcription]);
  
  // Simulate progress for better UX during long transcriptions
  useEffect(() => {
    if (view !== "processing") return;
    
    // Update progress for visual feedback
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        // Slow down progress as it gets higher
        const increment = prev < 30 ? 5 : prev < 60 ? 3 : prev < 80 ? 1 : 0.5;
        return Math.min(prev + increment, 95); // Never reach 100% until complete
      });
      
      // Also track elapsed time
      setTimePassed(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(progressInterval);
  }, [view]);

  // Mutation to upload and transcribe file
  const { mutate: uploadFile, isPending } = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiRequest("POST", "/api/transcribe", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setTranscriptionId(data.id);
      setView("processing");
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || "Failed to upload file");
      setView("error");
    },
  });

  const handleFileSelected = (file: File) => {
    if (file) {
      // Validate file size
      if (file.size > 25 * 1024 * 1024) {
        setErrorMessage("File size exceeds 25MB limit. Please upload a smaller file.");
        setView("error");
        return;
      }

      // Validate file type
      const fileExtTemp = file.name.split('.').pop()?.toLowerCase();
      // If extension is undefined, use empty string to avoid type issues
      const fileExt = fileExtTemp || '';
      
      if (!["mp3", "wav", "m4a"].includes(fileExt)) {
        setErrorMessage("Invalid file format. Please upload an MP3, WAV, or M4A file.");
        setView("error");
        return;
      }

      // Set file info
      setCurrentFile({
        name: file.name,
        size: file.size,
        type: fileExt, // Now fileExt is guaranteed to be a string
        file: file
      });

      // Upload file
      uploadFile(file);
    }
  };

  const handleRemoveFile = () => {
    if (view !== "processing") {
      setCurrentFile(null);
      setTranscriptionId(null);
      setView("upload");
    }
  };

  const handleTryAgain = () => {
    setCurrentFile(null);
    setTranscriptionId(null);
    setErrorMessage("");
    setView("upload");
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="p-6">
        {view === "upload" && (
          <UploadArea onFileSelected={handleFileSelected} isUploading={isPending} />
        )}

        {currentFile && (view === "processing" || view === "result") && (
          <FileDetails 
            file={currentFile}
            onRemove={handleRemoveFile}
            disabled={view === "processing"}
          />
        )}

        {view === "processing" && (
          <ProcessingState 
            progress={progress} 
            isProcessing={true}
            timePassed={timePassed}
          />
        )}

        {view === "result" && transcription?.text && (
          <TranscriptionResult
            transcriptionText={transcription.text}
            fileName={currentFile?.name || "transcript"}
            onNewTranscription={handleTryAgain}
          />
        )}

        {view === "error" && (
          <ErrorState 
            errorMessage={errorMessage} 
            onTryAgain={handleTryAgain} 
          />
        )}
      </div>
    </div>
  );
}
