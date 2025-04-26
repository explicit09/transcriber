import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Calendar, Users, Clock, MessageSquare, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

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
  createdAt: string | null;
  updatedAt: string | null;
}

export default function TranscriptionHistory() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  
  // Query to get all transcriptions
  const { data: transcriptions, isLoading, error } = useQuery<Transcription[]>({
    queryKey: ['/api/transcriptions'],
  });

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";
    try {
      return format(new Date(dateString), "MMMM d, yyyy");
    } catch (e) {
      return "Invalid date";
    }
  };

  // Calculate transcription duration (based on 1 char ≈ 0.5-1 word, 150 words/min speaking rate)
  const estimateAudioDuration = (text: string | null) => {
    if (!text) return "Unknown";
    const words = text.length / 5; // Rough estimate of words based on character count
    const minutes = words / 150; // Based on average speaking rate
    
    if (minutes < 1) {
      return `${Math.round(minutes * 60)} seconds`;
    }
    
    return `${Math.round(minutes)} minute${minutes >= 2 ? 's' : ''}`;
  };

  // Filter transcriptions based on search term
  const filteredTranscriptions = transcriptions?.filter((transcription) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (transcription.meetingTitle?.toLowerCase().includes(searchLower) || 
       transcription.fileName.toLowerCase().includes(searchLower) ||
       transcription.participants?.toLowerCase().includes(searchLower) ||
       transcription.text?.toLowerCase().includes(searchLower))
    );
  }) || [];

  // Sort by date (newest first)
  const sortedTranscriptions = [...filteredTranscriptions].sort((a, b) => {
    const dateA = a.meetingDate || a.createdAt || "";
    const dateB = b.meetingDate || b.createdAt || "";
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Meeting Transcriptions</h1>
        <Link href="/">
          <Button>New Transcription</Button>
        </Link>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <Input
          className="pl-10"
          placeholder="Search by meeting title, participants, or content..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-gray-600">Loading transcriptions...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 p-4 rounded-md text-red-600 mb-6">
          Failed to load transcriptions. Please try again.
        </div>
      )}

      {sortedTranscriptions.length === 0 && !isLoading && (
        <div className="text-center py-16 bg-gray-50 rounded-lg">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-xl font-medium text-gray-700">No transcriptions found</h3>
          <p className="text-gray-500 mt-2">
            {searchTerm ? "Try different search terms" : "Upload an audio file to create a transcription"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {sortedTranscriptions.map((transcription) => (
          <Card key={transcription.id} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-semibold line-clamp-1">
                  {transcription.meetingTitle || transcription.fileName}
                </h3>
                
                <div className="mt-2 space-y-1 text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>{formatDate(transcription.meetingDate || transcription.createdAt)}</span>
                  </div>
                  
                  {transcription.participants && (
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      <span className="line-clamp-1">{transcription.participants}</span>
                    </div>
                  )}
                  
                  {transcription.text && (
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>Duration: {estimateAudioDuration(transcription.text)}</span>
                    </div>
                  )}
                </div>
                
                {transcription.text && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-600 line-clamp-2">
                      {transcription.text.substring(0, 200)}...
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-row lg:flex-col items-center gap-3 lg:items-end justify-between lg:min-w-[180px]">
                <div className="text-xs text-gray-500 text-right">
                  <div>{formatFileSize(transcription.fileSize)}</div>
                  <div className="mt-1">{transcription.fileType.toUpperCase()} file</div>
                </div>
                
                <Link href={`/transcription/${transcription.id}`}>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}