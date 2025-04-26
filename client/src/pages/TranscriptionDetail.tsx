import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Loader2, 
  ArrowLeft, 
  Trash2, 
  Clock, 
  Calendar, 
  Users, 
  AlertTriangle, 
  Languages, 
  FileAudio, 
  MessageSquareText,
  Download,
  FileDown,
  CheckSquare
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TranscriptEditor from "@/components/TranscriptEditor";
import InteractiveTranscript from "@/components/InteractiveTranscript";
import { StructuredTranscript } from "@shared/schema";

// Type definition for transcription data from the API
interface Transcription {
  id: number;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: string;
  text: string | null;
  error: string | null;
  // Meeting metadata
  meetingTitle: string | null;
  meetingDate: string | null;
  participants: string | null;
  // Advanced features
  speakerLabels: boolean;
  speakerCount: number | null;
  hasTimestamps: boolean;
  duration: number | null;
  language: string | null;
  summary: string | null;
  actionItems: string | null;
  keywords: string | null;
  translatedText: string | null;
  // Timestamps
  createdAt: string | null;
  updatedAt: string | null;
}

export default function TranscriptionDetail() {
  const [, params] = useRoute("/transcription/:id");
  const id = params?.id ? parseInt(params.id) : undefined;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("view");
  
  // Query to get transcription data
  const { 
    data: transcription, 
    isLoading,
    error
  } = useQuery<Transcription>({
    queryKey: [`/api/transcriptions/${id}`],
    enabled: !!id,
  });
  
  // Delete transcription mutation
  const { mutate: deleteTranscription, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      if (!id) return;
      await apiRequest("DELETE", `/api/transcriptions/${id}`);
    },
    onSuccess: () => {
      // Invalidate transcriptions list query to update the UI
      queryClient.invalidateQueries({ queryKey: ['/api/transcriptions'] });
      
      toast({
        title: "Transcription deleted",
        description: "The transcription has been permanently deleted.",
        variant: "default",
      });
      
      // Redirect to history page
      window.location.href = "/history";
    },
    onError: (error) => {
      toast({
        title: "Failed to delete",
        description: "There was an error deleting the transcription. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";
    try {
      return format(new Date(dateString), "MMMM d, yyyy 'at' h:mm a");
    } catch (e) {
      return "Invalid date";
    }
  };
  
  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Parse structured transcript if available
  const parseStructuredTranscript = (): StructuredTranscript | null => {
    if (!transcription?.text) return null;
    
    // Try to parse JSON
    try {
      return JSON.parse(transcription.text) as StructuredTranscript;
    } catch (e) {
      // If not valid JSON, check if it has timestamps or speaker labels
      if (transcription.hasTimestamps || transcription.speakerLabels) {
        // Try to extract structured data from text format
        try {
          // Check if the text has timestamp patterns
          const hasStructuredContent = transcription.text && (
            transcription.text.includes('[') && 
            (transcription.text.includes(']: ') || transcription.text.includes('Speaker') || 
            transcription.text.match(/\[\d+:\d+\]/))
          );
          
          if (hasStructuredContent) {
            // Try to extract segments using regex patterns
            // Format: [00:00] Speaker 1: This is what they said
            let segments = [];
            let timeMatches = transcription.text.match(/\[([0-9:]+)\](?:\s*([^:]+))?:\s*(.+?)(?=\n\[|$)/gs);
            
            // If no matches found, try another common format
            // Format: Speaker 1 [00:00]: This is what they said
            if (!timeMatches || timeMatches.length === 0) {
              timeMatches = transcription.text.match(/([^[]+)\s*\[([0-9:]+)\]:\s*(.+?)(?=\n[^[]+\s*\[|$)/gs);
            }
            
            if (timeMatches && timeMatches.length > 0) {
              segments = timeMatches.map(match => {
                let timeMatch, speakerMatch, textMatch, startTime;
                
                // Try first format: [00:00] Speaker: Text
                if (match.match(/^\[([0-9:]+)\]/)) {
                  timeMatch = match.match(/\[([0-9:]+)\]/);
                  speakerMatch = match.match(/\[[0-9:]+\]\s*([^:]+):/);
                  textMatch = match.match(/\[[0-9:]+\](?:\s*[^:]+)?:\s*(.+)/s);
                } 
                // Try second format: Speaker [00:00]: Text
                else if (match.match(/[^[]+\s*\[([0-9:]+)\]:/)) {
                  timeMatch = match.match(/\[([0-9:]+)\]/);
                  speakerMatch = match.match(/^([^[]+)\s*\[[0-9:]+\]:/);
                  textMatch = match.match(/[^[]+\s*\[[0-9:]+\]:\s*(.+)/s);
                }
                
                // Extract time components
                const time = timeMatch ? timeMatch[1] : "00:00";
                const [minutes, seconds] = time.split(':').map(Number);
                startTime = minutes * 60 + (seconds || 0);
                
                const speaker = speakerMatch ? speakerMatch[1].trim() : undefined;
                const text = textMatch ? textMatch[1].trim() : match;
                
                return {
                  start: startTime || 0,
                  end: (startTime || 0) + 10, // Approximate 10-second segments
                  text,
                  speaker
                };
              });
              
              return {
                segments,
                metadata: {
                  speakerCount: transcription.speakerLabels ? transcription.speakerCount : undefined,
                  duration: transcription.duration,
                  language: transcription.language || undefined
                }
              };
            }
          }
        } catch (parseError) {
          console.error("Error parsing structured format from text:", parseError);
        }
      }
      
      // If all parsing attempts fail, return null
      return null;
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <span className="text-gray-500">Loading transcription...</span>
        </div>
      </div>
    );
  }
  
  if (error || !transcription) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="bg-red-50 p-6 rounded-lg">
          <h2 className="text-xl text-red-800 font-semibold mb-2">Error loading transcription</h2>
          <p className="text-red-600 mb-4">
            The transcription could not be found or there was an error loading it.
          </p>
          <Link href="/history">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Return to History
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  // Parse structured transcript
  const structuredTranscript = parseStructuredTranscript();
  
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <Link href="/history">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {transcription.meetingTitle || transcription.fileName}
          </h1>
          
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {transcription.meetingDate && (
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                <span>{formatDate(transcription.meetingDate)}</span>
              </div>
            )}
            
            {transcription.participants && (
              <div className="flex items-center">
                <Users className="h-4 w-4 mr-1" />
                <span>{transcription.participants}</span>
              </div>
            )}
            
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              <span>Updated {formatDate(transcription.updatedAt || transcription.createdAt)}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <a 
            href={`/api/transcriptions/${transcription.id}/pdf`} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </a>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the transcription and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteTranscription()}
                  className="bg-red-500 hover:bg-red-600"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      
      {/* File Info */}
      <div className="mb-6 bg-gray-50 p-4 rounded-md text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <span className="text-gray-500">File:</span>{" "}
            <span className="font-medium">{transcription.fileName}</span>
          </div>
          <div>
            <span className="text-gray-500">Size:</span>{" "}
            <span className="font-medium">{formatFileSize(transcription.fileSize)}</span>
          </div>
          <div>
            <span className="text-gray-500">Type:</span>{" "}
            <span className="font-medium">.{transcription.fileType}</span>
          </div>
          {transcription.language && (
            <div>
              <span className="text-gray-500">Language:</span>{" "}
              <span className="font-medium">{transcription.language}</span>
            </div>
          )}
          {transcription.duration && (
            <div>
              <span className="text-gray-500">Duration:</span>{" "}
              <span className="font-medium">
                {Math.floor(transcription.duration / 60)}m {Math.floor(transcription.duration % 60)}s
              </span>
            </div>
          )}
        </div>
      </div>
      
      {transcription.error ? (
        <div className="bg-red-50 p-6 rounded-lg mb-6">
          <div className="flex items-start">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3 mt-0.5" />
            <div>
              <h3 className="text-lg font-medium text-red-800">Transcription Failed</h3>
              <p className="mt-2 text-red-700">{transcription.error}</p>
            </div>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="view" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            {transcription.hasTimestamps && structuredTranscript && (
              <TabsTrigger value="interactive">Interactive</TabsTrigger>
            )}
            {transcription.summary && (
              <TabsTrigger value="summary">Summary</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="view" className="prose max-w-none">
            {transcription.text ? (
<<<<<<< HEAD
              <div className="bg-white border rounded-md p-5 whitespace-pre-line">
                {transcription.text}
=======
              <div>
                {transcription.hasTimestamps || transcription.speakerLabels ? (
                  // Show with enhanced formatting for timestamped/speaker content
                  <div className="space-y-3">
                    {transcription.text.split('\n').map((line, index) => {
                      // Check if line contains timestamp pattern [00:00]
                      const hasTimestamp = line.match(/\[\d+:\d+\]/);
                      // Check if line contains speaker pattern
                      const hasSpeaker = line.match(/(?:\[\d+:\d+\]\s*([^:]+):|([^[]+)\s*\[\d+:\d+\]:)/);
                      
                      if (hasTimestamp) {
                        // Extract the timestamp and speaker
                        const timestampMatch = line.match(/\[\d+:\d+\]/);
                        const timestamp = timestampMatch ? timestampMatch[0] : '';
                        
                        if (hasSpeaker) {
                          // If we have a speaker format like "[00:00] Speaker 1: Text"
                          const speakerEndIndex = line.indexOf(':', timestamp ? line.indexOf(timestamp) + timestamp.length : 0);
                          
                          if (speakerEndIndex > 0) {
                            const speaker = line.substring(
                              timestamp.length, 
                              speakerEndIndex
                            ).trim();
                            const text = line.substring(speakerEndIndex + 1).trim();
                            
                            return (
                              <div key={index} className="pb-3 border-b last:border-b-0">
                                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                                  <span className="text-xs font-semibold text-gray-500">{timestamp}</span>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                                    {speaker}
                                  </span>
                                </div>
                                <div className="ml-1">{text}</div>
                              </div>
                            );
                          }
                        }
                        
                        // Just has timestamp without clear speaker format
                        return (
                          <div key={index} className="pb-3 border-b last:border-b-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-500">{timestamp}</span>
                            </div>
                            <div className="ml-1">{line.replace(timestamp, '').trim()}</div>
                          </div>
                        );
                      }
                      
                      // Regular line without timestamp
                      return (
                        <div key={index} className={line.trim() === '' ? 'h-4' : 'mb-2'}>
                          {line}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Regular text with proper line breaks
                  <div className="whitespace-pre-wrap">
                    {transcription.text}
                  </div>
                )}
>>>>>>> aa5f53d99eaf3558d057fcd15e5eb9ed663500f7
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-md">
                <MessageSquareText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No transcript content available</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="edit">
            {transcription.text && (
              <TranscriptEditor
                transcriptionId={transcription.id}
                originalText={transcription.text}
                fileName={transcription.fileName}
                hasTimestamps={transcription.hasTimestamps}
                speakerLabels={transcription.speakerLabels}
                structuredTranscript={structuredTranscript || undefined}
                duration={transcription.duration || undefined}
              />
            )}
          </TabsContent>
          
          {transcription.hasTimestamps && structuredTranscript && (
            <TabsContent value="interactive">
              <InteractiveTranscript
                transcriptionId={transcription.id}
                structuredTranscript={structuredTranscript}
                originalText={transcription.text || ""}
                fileName={transcription.fileName}
              />
            </TabsContent>
          )}
          
          {transcription.summary && (
            <TabsContent value="summary">
              <div className="space-y-6">
                <div className="bg-white border rounded-md p-5">
                  <h3 className="text-lg font-medium mb-3">Summary</h3>
                  <p className="whitespace-pre-line">{transcription.summary}</p>
                </div>
                
                {transcription.keywords && (
                  <div className="bg-white border rounded-md p-5">
                    <h3 className="text-lg font-medium mb-3">Keywords</h3>
                    <div className="flex flex-wrap gap-2">
                      {transcription.keywords.split(',').map((keyword, index) => (
                        <span 
                          key={index}
                          className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-sm"
                        >
                          {keyword.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {transcription.actionItems && (
                  <div className="bg-white border rounded-md p-5">
                    <h3 className="text-lg font-medium mb-3">Action Items</h3>
                    <ul className="space-y-2">
                      {transcription.actionItems.split('\n').filter(Boolean).map((item, index) => (
                        <li key={index} className="flex items-start">
                          <CheckSquare className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                          <span>{item.trim()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}