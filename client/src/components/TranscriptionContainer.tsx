import { useState, useEffect } from "react";
import UploadArea from "./UploadArea";
import ProcessingState from "./ProcessingState";
import FileDetails from "./FileDetails";
import TranscriptionResult from "./TranscriptionResult";
import ErrorState from "./ErrorState";
import MeetingMetadataForm, { MeetingMetadata } from "./MeetingMetadataForm";
import AudioRecorder from "./AudioRecorder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  meetingTitle: string | null;
  meetingDate: string | null;
  participants: string | null;
  speakerLabels: boolean;
  speakerCount: number | null;
  hasTimestamps: boolean;
  duration: number | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  const [view, setView] = useState<"upload" | "metadata" | "processing" | "result" | "error">("upload");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [meetingMetadata, setMeetingMetadata] = useState<MeetingMetadata>({
    meetingTitle: "",
    meetingDate: new Date(),
    participants: "",
    enableSpeakerLabels: true,
    enableTimestamps: false,
    language: null,
    generateSummary: false
  });
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

  // Mutation to upload and transcribe file with metadata
  const { mutate: uploadFile, isPending } = useMutation({
    mutationFn: async ({ file, metadata }: { file: File, metadata: MeetingMetadata }) => {
      const formData = new FormData();
      formData.append("file", file);
      
      // Add meeting metadata
      formData.append("meetingTitle", metadata.meetingTitle);
      formData.append("meetingDate", metadata.meetingDate.toISOString());
      formData.append("participants", metadata.participants);
      
      // Add advanced options
      formData.append("enableSpeakerLabels", metadata.enableSpeakerLabels.toString());
      formData.append("enableTimestamps", metadata.enableTimestamps.toString());
      if (metadata.language) {
        formData.append("language", metadata.language);
      }
      formData.append("generateSummary", metadata.generateSummary.toString());

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

      // Set file info and proceed to metadata entry
      setCurrentFile({
        name: file.name,
        size: file.size,
        type: fileExt,
        file: file
      });
      
      // Auto-generate a meeting title from filename
      const suggestedTitle = file.name
        .replace(/\.[^/.]+$/, "") // Remove extension
        .replace(/_/g, " ")       // Replace underscores with spaces
        .replace(/-/g, " ")       // Replace hyphens with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
      
      setMeetingMetadata({
        ...meetingMetadata,
        meetingTitle: suggestedTitle
      });
      
      // Move to metadata step
      setView("metadata");
    }
  };
  
  // Handle meeting metadata submission
  const handleMetadataSubmit = (metadata: MeetingMetadata) => {
    setMeetingMetadata(metadata);
    
    // Now upload the file with metadata
    if (currentFile?.file) {
      uploadFile({ file: currentFile.file, metadata });
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
          <div className="space-y-6">
            <Tabs defaultValue="file" className="w-full">
              <TabsList className="mb-4 grid grid-cols-2 w-full">
                <TabsTrigger value="file">Upload File</TabsTrigger>
                <TabsTrigger value="record">Record Audio</TabsTrigger>
              </TabsList>
              
              <TabsContent value="file">
                <UploadArea onFileSelected={handleFileSelected} isUploading={isPending} />
              </TabsContent>
              
              <TabsContent value="record">
                <AudioRecorder 
                  onRecordingComplete={handleFileSelected}
                  maxDuration={3600} // 60 minutes (1 hour)
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
        
        {view === "metadata" && currentFile && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4 pb-4 border-b">
              <button 
                onClick={() => setView("upload")} 
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
              <h3 className="text-lg font-medium flex-1">Meeting Details</h3>
            </div>
            
            <FileDetails 
              file={currentFile} 
              onRemove={handleRemoveFile} 
              disabled={false} 
            />
            
            <MeetingMetadataForm 
              onSubmit={handleMetadataSubmit} 
              isUploading={isPending}
              defaultValues={meetingMetadata}
            />
          </div>
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
          <div className="space-y-4">
            {transcription.meetingTitle && (
              <div className="border-b pb-4">
                <h3 className="text-xl font-medium">{transcription.meetingTitle}</h3>
                {transcription.meetingDate && (
                  <div className="text-sm text-gray-500 mt-1">
                    {new Date(transcription.meetingDate).toLocaleDateString()} 
                    {transcription.participants && ` • ${transcription.participants}`}
                  </div>
                )}
              </div>
            )}
            
            <TranscriptionResult
              transcriptionText={transcription.text || ""}
              fileName={transcription.meetingTitle || currentFile?.name || "transcript"}
              onNewTranscription={handleTryAgain}
            />
          </div>
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
