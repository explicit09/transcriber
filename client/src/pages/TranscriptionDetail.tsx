import React, { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { TranscriptEditor } from '@/components/TranscriptEditor';
import NavigableTranscript from '@/components/NavigableTranscript';
import SpeakerLabels from '@/components/SpeakerLabels';
import TranscriptView from '@/components/TranscriptView';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash, Download } from 'lucide-react';
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Loading transcription...</span>
      </div>
    );
  }

  // Error state
  if (error || !transcription) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error Loading Transcription</CardTitle>
            <CardDescription className="text-red-600">
              We were unable to load the requested transcription.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">
              {error instanceof Error ? error.message : "The transcription could not be found or may have been deleted."}
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setLocation('/')}>Return to Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{transcription.fileName}</h1>
          <p className="text-muted-foreground">
            {new Date(transcription.createdAt).toLocaleString()}
            {transcription.duration && ` • ${Math.floor(transcription.duration / 60)}:${String(Math.floor(transcription.duration % 60)).padStart(2, '0')}`}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
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
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

      {/* Display speaker labels if available */}
      {transcription.structuredTranscript && Array.isArray(transcription.structuredTranscript.segments) && (
        <SpeakerLabels 
          segments={transcription.structuredTranscript.segments}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="view">View</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
        </TabsList>

        <TabsContent value="view" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Transcription</CardTitle>
              <CardDescription>
                View the transcription content with timestamps and speaker labels.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
      </Tabs>
    </div>
  );
}
