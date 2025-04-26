import { useState } from "react";
import UploadArea from "./UploadArea";
import ProcessingState from "./ProcessingState";
import FileDetails from "./FileDetails";
import TranscriptionResult from "./TranscriptionResult";
import ErrorState from "./ErrorState";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

  // Query to get transcription status and result
  const { data: transcription, isLoading } = useQuery({
    queryKey: [transcriptionId ? `/api/transcriptions/${transcriptionId}` : null],
    enabled: !!transcriptionId && view === "processing",
    refetchInterval: view === "processing" ? 1000 : false,
    onSuccess: (data) => {
      if (data?.status === "completed") {
        setView("result");
      } else if (data?.status === "error") {
        setErrorMessage(data.error || "Failed to transcribe audio");
        setView("error");
      }
    },
  });

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
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!["mp3", "wav", "m4a"].includes(fileExt)) {
        setErrorMessage("Invalid file format. Please upload an MP3, WAV, or M4A file.");
        setView("error");
        return;
      }

      // Set file info
      setCurrentFile({
        name: file.name,
        size: file.size,
        type: fileExt,
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

  // Calculate progress percentage (simulated)
  const progressPercentage = (transcription?.status === "processing") ? 50 : 0;

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
            progress={progressPercentage} 
            isProcessing={true} 
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
