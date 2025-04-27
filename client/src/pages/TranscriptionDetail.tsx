import React, { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { TranscriptEditor } from '@/components/TranscriptEditor';
import NavigableTranscript from '@/components/NavigableTranscript';
import SpeakerLabels from '@/components/SpeakerLabels';
import TranscriptView from '@/components/TranscriptView';
import SpeakerSimilarity from '@/components/SpeakerSimilarity';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash, Download, FileText } from 'lucide-react';
import { Transcription, StructuredTranscript } from '@shared/schema';
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

export default function TranscriptionDetail() {
  const [match, params] = useRoute<{ id: string }>("/transcription/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('view');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isMergingSpeakers, setIsMergingSpeakers] = useState(false);
  
  const id = params?.id;

  // Fetch transcription details
  const { data: transcription, isLoading, error } = useQuery({
    queryKey: [`/api/transcriptions/${id}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!id,
  });

  // Handle save transcript mutation
  const saveTranscriptMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("PATCH", `/api/transcriptions/${id}`, {
        text
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${id}`] });
      toast({
        title: "Transcription saved",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error) => {
      console.error('Error saving transcription:', error);
      toast({
        title: "Error saving transcription",
        description: "There was a problem saving your changes. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle delete transcription
  const deleteTranscription = async () => {
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/transcriptions/${id}`);
      toast({
        title: "Transcription deleted",
        description: "The transcription has been deleted successfully.",
      });
      setLocation('/');
    } catch (error) {
      console.error('Error deleting transcription:', error);
      toast({
        title: "Error deleting transcription",
        description: "There was a problem deleting the transcription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle generate summary
  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingSummary(true);
      const response = await apiRequest("POST", `/api/transcriptions/${id}/summary`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${id}`] });
      toast({
        title: "Summary generated",
        description: "The transcript summary and action items have been generated successfully.",
      });
      setIsGeneratingSummary(false);
    },
    onError: (error) => {
      console.error('Error generating summary:', error);
      toast({
        title: "Error generating summary",
        description: "There was a problem generating the summary. Please try again.",
        variant: "destructive",
      });
      setIsGeneratingSummary(false);
    }
  });
  
  // Handle file download
  const handleDownload = async () => {
    try {
      const response = await apiRequest("GET", `/api/transcriptions/${id}/pdf`);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${transcription?.fileName || `transcription-${id}`}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading transcription:', error);
      toast({
        title: "Error downloading transcription",
        description: "There was a problem downloading the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle speaker merging
  const mergeSpeakersMutation = useMutation({
    mutationFn: async (targetSpeakerCount: number) => {
      setIsMergingSpeakers(true);
      const response = await apiRequest("POST", `/api/transcriptions/${id}/merge-speakers`, {
        targetSpeakerCount
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${id}`] });
      toast({
        title: "Speakers merged",
        description: "Similar speakers have been successfully merged.",
      });
    },
    onError: (error) => {
      console.error('Error merging speakers:', error);
      toast({
        title: "Error merging speakers",
        description: "There was a problem merging the speakers. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsMergingSpeakers(false);
    }
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
        <div className="p-10 bg-white rounded-xl shadow-lg flex flex-col items-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
          <span className="text-lg font-medium text-gray-700">Loading transcription...</span>
          <p className="text-gray-500 text-sm mt-2">Please wait while we prepare your transcript</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !transcription) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="h-2 bg-red-500"></div>
          <CardHeader className="bg-red-50">
            <CardTitle className="text-red-700 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Error Loading Transcription
            </CardTitle>
            <CardDescription className="text-red-600">
              We were unable to load the requested transcription.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-red-600 bg-red-50 p-4 rounded-md border border-red-100">
              {error instanceof Error ? error.message : "The transcription could not be found or may have been deleted."}
            </p>
          </CardContent>
          <CardFooter className="border-t bg-gray-50">
            <Button onClick={() => setLocation('/')} className="bg-blue-500 hover:bg-blue-600">
              Return to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-[calc(100vh-64px)] pb-10">
      <div className="max-w-5xl mx-auto pt-8 px-4 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
          <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-600">
                  {transcription.fileName}
                </h1>
                <div className="text-gray-500 flex items-center mt-2 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(transcription.createdAt).toLocaleString()}
                  
                  {transcription.duration && (
                    <span className="flex items-center ml-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {Math.floor(transcription.duration / 60)}:{String(Math.floor(transcription.duration % 60)).padStart(2, '0')}
                    </span>
                  )}
                  
                  {transcription.structuredTranscript?.speakerCount && (
                    <span className="flex items-center ml-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {transcription.structuredTranscript.speakerCount} speakers
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 md:gap-3 mt-2 md:mt-0">
                <Button 
                  variant="outline" 
                  className="bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                  onClick={() => generateSummaryMutation.mutate()}
                  disabled={isGeneratingSummary || !transcription.text}
                >
                  {isGeneratingSummary ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Generate Summary
                    </>
                  )}
                </Button>
                
                <Button 
                  variant="outline" 
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={handleDownload}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50">
                      <Trash className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the transcription.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={deleteTranscription}
                        disabled={isDeleting}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
          </div>
        </div>

        {/* Display speaker labels if available */}
        {transcription.structuredTranscript && Array.isArray(transcription.structuredTranscript.segments) && (
          <div className="p-4 bg-white rounded-xl shadow-sm mb-6">
            <SpeakerLabels 
              segments={transcription.structuredTranscript.segments}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 bg-white shadow-sm mb-2">
            <TabsTrigger value="view" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">View</TabsTrigger>
            <TabsTrigger value="edit" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Edit</TabsTrigger>
            <TabsTrigger value="speakers" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Speakers</TabsTrigger>
          </TabsList>

          <TabsContent value="view" className="mt-4">
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center text-blue-700">
                  <FileText className="h-5 w-5 mr-2" />
                  Transcription
                </CardTitle>
                <CardDescription>
                  View the transcription content with timestamps and speaker labels.
                </CardDescription>
              </CardHeader>
              <CardContent className="bg-white p-6">
                <TranscriptView 
                  transcription={transcription}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="mt-4">
            <TranscriptEditor 
              transcription={transcription}
              onSave={(text) => saveTranscriptMutation.mutateAsync(text)}
            />
          </TabsContent>

          <TabsContent value="speakers" className="mt-4">
            {transcription.structuredTranscript && (
              <SpeakerSimilarity 
                transcriptionId={parseInt(id)}
                onMergeSpeakers={(targetCount) => mergeSpeakersMutation.mutateAsync(targetCount)}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
