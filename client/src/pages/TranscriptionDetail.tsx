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
  FileDown
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
              Download PDF
            </Button>
          </a>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  transcription and all of its data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteTranscription()}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="border-b p-4 bg-gray-50">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="text-sm text-gray-500">
              <span className="font-medium">{transcription.fileName}</span> • 
              <span className="ml-1">{formatFileSize(transcription.fileSize)}</span> • 
              <span className="ml-1 uppercase">{transcription.fileType} file</span>
            </div>
            
            {transcription.status === "error" && (
              <div className="text-sm text-red-600 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1" />
                <span>{transcription.error || "An error occurred during transcription"}</span>
              </div>
            )}
          </div>
        </div>
        
        <Tabs defaultValue="view" value={activeTab} onValueChange={setActiveTab} className="p-6">
          <TabsList className="mb-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit & Analyze</TabsTrigger>
            {(transcription.summary || transcription.language || transcription.duration || transcription.speakerCount) && (
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="view" className="mt-0">
            {transcription.text ? (
              <div className="whitespace-pre-wrap">{transcription.text}</div>
            ) : (
              <div className="p-6 text-center text-gray-500">
                No transcription text available
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="edit" className="mt-0">
            {transcription.text ? (
              <TranscriptEditor 
                transcriptionId={transcription.id}
                originalText={transcription.text}
                fileName={transcription.meetingTitle || transcription.fileName}
                hasTimestamps={transcription.hasTimestamps}
                speakerLabels={transcription.speakerLabels}
                duration={transcription.duration ? transcription.duration : undefined}
                // Try to parse the structured transcript from text if it's in JSON format
                structuredTranscript={
                  (transcription.hasTimestamps || transcription.speakerLabels) &&
                  transcription.text.startsWith('{') ? 
                  (() => {
                    try {
                      return JSON.parse(transcription.text);
                    } catch (e) {
                      return undefined;
                    }
                  })() : undefined
                }
              />
            ) : (
              <div className="p-6 text-center text-gray-500">
                No transcription text available to edit
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="metadata" className="mt-0">
            <div className="space-y-6">
              {/* Audio metadata section */}
              {(transcription.duration || transcription.speakerCount || transcription.language) && (
                <div className="border rounded-md p-4">
                  <h3 className="text-lg font-medium mb-3 flex items-center">
                    <FileAudio className="h-5 w-5 mr-2 text-gray-500" />
                    Audio Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {transcription.duration && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Duration</h4>
                        <p className="text-sm text-gray-600">
                          {Math.floor(transcription.duration / 60)}:{(transcription.duration % 60).toString().padStart(2, '0')} minutes
                        </p>
                      </div>
                    )}
                    
                    {transcription.language && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Language</h4>
                        <div className="flex items-center">
                          <Languages className="h-4 w-4 mr-1 text-gray-500" />
                          <p className="text-sm text-gray-600">
                            {(() => {
                              // Convert language code to full name
                              const languageMap: Record<string, string> = {
                                'en': 'English',
                                'es': 'Spanish',
                                'fr': 'French',
                                'de': 'German',
                                'zh': 'Chinese',
                                'ja': 'Japanese',
                                'ko': 'Korean'
                              };
                              return languageMap[transcription.language] || transcription.language;
                            })()}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {transcription.speakerCount && transcription.speakerLabels && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Speakers</h4>
                        <p className="text-sm text-gray-600">
                          {transcription.speakerCount} {transcription.speakerCount === 1 ? 'person' : 'people'} speaking
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Summary section */}
              {transcription.summary && (
                <div className="border rounded-md p-4">
                  <h3 className="text-lg font-medium mb-3 flex items-center">
                    <MessageSquareText className="h-5 w-5 mr-2 text-gray-500" />
                    Summary
                  </h3>
                  <div className="text-gray-700 whitespace-pre-wrap">
                    {transcription.summary}
                  </div>
                </div>
              )}
              
              {/* Action Items section */}
              {transcription.actionItems && (
                <div className="border rounded-md p-4 mt-4">
                  <h3 className="text-lg font-medium mb-3 flex items-center">
                    <CheckSquare className="h-5 w-5 mr-2 text-gray-500" />
                    Action Items
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      try {
                        const actionItems = JSON.parse(transcription.actionItems);
                        return (
                          <ul className="list-disc pl-5 space-y-1">
                            {actionItems.map((item, index) => (
                              <li key={index} className="text-gray-700">
                                {item}
                              </li>
                            ))}
                          </ul>
                        );
                      } catch (e) {
                        return <p className="text-gray-500">No action items found</p>;
                      }
                    })()}
                  </div>
                </div>
              )}
              
              {/* Keywords section */}
              {transcription.keywords && (
                <div className="border rounded-md p-4">
                  <h3 className="text-lg font-medium mb-3">Key Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {transcription.keywords.split(',').map((keyword, index) => (
                      <span 
                        key={index} 
                        className="px-2 py-1 bg-gray-100 rounded-full text-sm text-gray-700"
                      >
                        {keyword.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}