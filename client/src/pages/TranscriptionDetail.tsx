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
import SpeakerManager from "@/components/SpeakerManager";
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
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Query to get transcription data
  const { 
    data: transcription, 
    isLoading,
    error,
    refetch
  } = useQuery<Transcription>({
    queryKey: [`/api/transcriptions/${id}`, refreshCounter],
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
  
  // Function to refresh transcription data
  const refreshTranscription = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
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
      return null; // Not a JSON structure, which is fine
    }
  };

  // Get structured transcript if available
  const structuredTranscript = parseStructuredTranscript();

  // Calculate duration display
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "Unknown duration";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = "";
    if (hours > 0) {
      result += `${hours} hour${hours > 1 ? "s" : ""} `;
    }
    if (minutes > 0 || hours > 0) {
      result += `${minutes} minute${minutes !== 1 ? "s" : ""} `;
    }
    if (secs > 0 || (hours === 0 && minutes === 0)) {
      result += `${secs} second${secs !== 1 ? "s" : ""}`;
    }
    
    return result.trim();
  };

  // Download transcript as PDF
  const downloadPDF = async () => {
    if (!id) return;
    
    try {
      const response = await apiRequest("GET", `/api/transcriptions/${id}/pdf`, null, {
        responseType: 'blob'
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${transcription?.meetingTitle || 'transcript'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "PDF Downloaded",
        description: "The transcript PDF has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // If loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-gray-500">Loading transcription...</p>
      </div>
    );
  }

  // If error
  if (error || !transcription) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Transcription Not Found</h2>
        <p className="text-gray-500 mb-6 text-center">
          The transcription you're looking for doesn't exist or couldn't be loaded.
        </p>
        <Link href="/history">
          <Button variant="default">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to History
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link href="/history">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        
        {/* Delete button and dialog */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the transcription. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-red-500 hover:bg-red-600" 
                onClick={() => deleteTranscription()}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>Delete</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      {/* Transcription header */}
      <div className="bg-white rounded-lg border p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {transcription.meetingTitle || transcription.fileName}
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center text-gray-500">
            <FileAudio className="h-4 w-4 mr-2 text-gray-400" />
            <span>{transcription.fileName}</span>
          </div>
          
          {transcription.meetingDate && (
            <div className="flex items-center text-gray-500">
              <Calendar className="h-4 w-4 mr-2 text-gray-400" />
              <span>{new Date(transcription.meetingDate).toLocaleDateString()}</span>
            </div>
          )}
          
          {transcription.participants && (
            <div className="flex items-center text-gray-500">
              <Users className="h-4 w-4 mr-2 text-gray-400" />
              <span>{transcription.participants}</span>
            </div>
          )}
          
          {transcription.duration !== null && (
            <div className="flex items-center text-gray-500">
              <Clock className="h-4 w-4 mr-2 text-gray-400" />
              <span>{formatDuration(transcription.duration)}</span>
            </div>
          )}
        </div>
        
        {/* Creation/update timestamps */}
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
          {transcription.createdAt && (
            <div>
              <span className="font-medium">Uploaded:</span> {formatDate(transcription.createdAt)}
            </div>
          )}
          
          {transcription.updatedAt && transcription.updatedAt !== transcription.createdAt && (
            <div>
              <span className="font-medium">Last modified:</span> {formatDate(transcription.updatedAt)}
            </div>
          )}
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={downloadPDF}>
          <FileDown className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
        
        {!transcription.summary && (
          <Button 
            variant="secondary" 
            onClick={async () => {
              try {
                const result = await apiRequest("POST", `/api/transcriptions/${transcription.id}/summary`);
                if (result) {
                  toast({
                    title: "Summary Generated",
                    description: "The summary has been successfully generated.",
                  });
                  refreshTranscription();
                }
              } catch (error) {
                toast({
                  title: "Failed to Generate Summary",
                  description: "There was an error generating the summary. Please try again.",
                  variant: "destructive",
                });
              }
            }}
          >
            <MessageSquareText className="mr-2 h-4 w-4" />
            Generate Summary
          </Button>
        )}
        
        {transcription.language && (
          <div className="flex items-center space-x-1 border px-3 py-1.5 rounded-md text-sm text-gray-600">
            <Languages className="h-4 w-4 text-gray-500" />
            <span>{transcription.language}</span>
          </div>
        )}
        
        {transcription.speakerLabels && (
          <div className="flex items-center space-x-1 border px-3 py-1.5 rounded-md text-sm text-gray-600">
            <Users className="h-4 w-4 text-gray-500" />
            <span>Speaker Detection</span>
            {transcription.speakerCount && (
              <span className="ml-1 bg-gray-100 px-1.5 py-0.5 rounded-full text-xs">
                {transcription.speakerCount}
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Transcript content */}
      {transcription.text && (
        <>
          {/* Add Speaker Manager if transcript has speaker labels */}
          {transcription.speakerLabels && (
            <SpeakerManager
              transcriptionId={transcription.id}
              transcriptionText={transcription.text}
              onTranscriptionUpdated={refreshTranscription}
            />
          )}
          
          <Tabs defaultValue="view" className="space-y-4" onValueChange={(value) => setActiveTab(value)}>
            <TabsList>
              <TabsTrigger value="view">View</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              {transcription.summary && (
                <TabsTrigger value="summary">Summary</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="view" className="prose max-w-none">
              {transcription.text ? (
                <div>
                  {transcription.hasTimestamps || transcription.speakerLabels ? (
                    // Show with enhanced formatting for timestamped/speaker content
                    <div className="space-y-3">
                      {/* Split by double newlines which separate different speaker blocks */}
                      {transcription.text.split('\n\n').map((block, index) => {
                        // Check if block contains timestamp pattern [00:00]
                        const hasTimestamp = block.match(/\[\d+:\d+\]/);
                        // Check if block contains speaker pattern
                        const hasSpeaker = block.match(/(?:\[\d+:\d+\]\s*([^:]+):|([^[]+)\s*\[\d+:\d+\]:)/);
                        
                        if (hasTimestamp) {
                          // Extract the timestamp and speaker
                          const timestampMatch = block.match(/\[\d+:\d+\]/);
                          const timestamp = timestampMatch ? timestampMatch[0] : '';
                          
                          if (hasSpeaker) {
                            // If we have a speaker format like "[00:00] Speaker 1: Text"
                            const speakerEndIndex = block.indexOf(':', timestamp ? block.indexOf(timestamp) + timestamp.length : 0);
                            
                            if (speakerEndIndex > 0) {
                              const speaker = block.substring(
                                timestamp.length, 
                                speakerEndIndex
                              ).trim();
                              const text = block.substring(speakerEndIndex + 1).trim();
                              
                              return (
                                <div key={index} className="pb-3 border-b last:border-b-0">
                                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                                    <span className="text-xs font-semibold text-gray-500">{timestamp}</span>
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                                      {speaker}
                                    </span>
                                  </div>
                                  <p className="text-gray-800 ml-12">{text}</p>
                                </div>
                              );
                            }
                          }
                          
                          // If no clear speaker but has timestamp
                          return (
                            <div key={index} className="pb-2">
                              <span className="text-xs font-semibold text-gray-500 mr-2">{timestamp}</span>
                              <span>{block.replace(timestamp, '').trim()}</span>
                            </div>
                          );
                        }
                        
                        // Regular text block
                        return <p key={index} className="text-gray-800">{block}</p>;
                      })}
                    </div>
                  ) : (
                    // Regular text with proper line breaks
                    <div className="whitespace-pre-wrap">
                      {transcription.text}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-md">
                  <MessageSquareText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No transcript content available</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="edit">
              <TranscriptEditor 
                transcriptionId={transcription.id}
                originalText={transcription.text || ''}
                fileName={transcription.fileName}
                hasTimestamps={transcription.hasTimestamps}
                speakerLabels={transcription.speakerLabels}
                structuredTranscript={structuredTranscript}
                duration={transcription.duration}
              />
            </TabsContent>
            
            {transcription.summary && (
              <TabsContent value="summary">
                <div className="space-y-6">
                  <div className="bg-white border rounded-md p-5">
                    <h3 className="text-lg font-medium mb-3">Summary</h3>
                    <p className="whitespace-pre-line">{transcription.summary}</p>
                  </div>
                  
                  {transcription.actionItems && (
                    <div className="bg-white border rounded-md p-5 border-l-4 border-l-green-500">
                      <h3 className="text-lg font-medium mb-3 flex items-center">
                        <CheckSquare className="h-5 w-5 text-green-500 mr-2" />
                        Key Actionables
                      </h3>
                      <ul className="space-y-3">
                        {transcription.actionItems.split('\n').filter(Boolean).map((item, index) => {
                          const isPriority = item.includes("[PRIORITY]");
                          const cleanItem = item.replace("[PRIORITY]", "").trim();
                          
                          return (
                            <li key={index} className={`flex items-start ${isPriority ? 'bg-amber-50 p-2 rounded-md border-l-2 border-l-amber-400' : ''}`}>
                              <div className="flex-shrink-0 mt-0.5 mr-3">
                                {isPriority ? (
                                  <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">!</span>
                                  </div>
                                ) : (
                                  <CheckSquare className="h-5 w-5 text-green-500" />
                                )}
                              </div>
                              <div className="flex-1">
                                <span className={`${isPriority ? 'font-medium' : ''}`}>{cleanItem}</span>
                                {isPriority && (
                                  <span className="text-xs font-medium text-amber-600 ml-2">Priority</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  
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
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}