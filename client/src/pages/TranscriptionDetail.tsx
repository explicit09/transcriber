import { useState, useCallback, useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
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
  FileDown,
  CheckSquare
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { StructuredTranscript } from "@shared/schema";

interface Transcription {
  id: number;
  fileName: string;
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
  language: string | null;
  summary: string | null;
  actionItems: string | null;
  keywords: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  structuredTranscript: StructuredTranscript | null;
}

export default function TranscriptionDetail() {
  const [, params] = useRoute("/transcription/:id");
  const id = params?.id ? parseInt(params.id, 10) : undefined;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("view");

  // Fetch transcription
  const { data: transcription, isLoading, error } = useQuery<Transcription>({
    queryKey: ["/api/transcriptions", id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/transcriptions/${id}`);
      const data = await response.json();
      return data as Transcription;
    },
    enabled: !!id,
  });

  // Delete mutation
  const { mutate: deleteTranscription, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/transcriptions/${id}`);
      return true;
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Transcription removed.", variant: "default" });
      setLocation("/history");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions"] });
    }
  });

  // Summary mutation
  const { mutate: generateSummary, isPending: isGeneratingSummary } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/transcriptions/${id}/summary`);
      return response.json();
    },
    onSuccess: () => toast({ title: "Summary ready", description: "Fetched summary.", variant: "default" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/transcriptions", id] })
  });

  // Callback handlers
  const handleDelete = useCallback(() => deleteTranscription(), [deleteTranscription]);
  const handleGenerateSummary = useCallback(() => generateSummary(), [generateSummary]);
  const handleDownloadPDF = useCallback(async () => {
    if (!id) return;
    try {
      const resp = await apiRequest("GET", `/api/transcriptions/${id}/pdf`, null, { responseType: 'blob' });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${transcription?.meetingTitle || 'transcript'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "PDF saved." });
    } catch {
      toast({ title: "Error", description: "Failed to download PDF.", variant: "destructive" });
    }
  }, [id, transcription, toast]);

  // Memoized arrays
  const actionItems = useMemo(() => 
    transcription?.actionItems?.split('\n').filter(Boolean) ?? [],
    [transcription?.actionItems]
  );
  const keywords = useMemo(() => 
    transcription?.keywords?.split(',').map(k => k.trim()) ?? [],
    [transcription?.keywords]
  );

  // Format helpers
  const formatDate = useCallback((dateStr: string | null) => 
    dateStr ? format(new Date(dateStr), "MMMM d, yyyy 'at' h:mm a") : "Unknown",
    []
  );
  const formatDuration = useCallback((sec: number | null) => {
    if (!sec) return "Unknown";
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60);
    return `${h? h+'h ':''}${m? m+'m ':''}${s}s`;
  }, []);
  const formatTime = useCallback((sec: number) => {
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = Math.floor(sec%60);
    return `${h? h+':':''}${m? m+':':''}${s}`;
  }, []);

  // Early returns
  if (isLoading) return <Loading />;
  if (error || !transcription) return <NotFound />;

  return (
    <div className="space-y-6">
      <Header
        onBack={() => setLocation('/history')}
        onDelete={handleDelete}
        deleting={isDeleting}
      />
      <Metadata transcription={transcription} formatDate={formatDate} formatDuration={formatDuration} />
      <Actions
        onDownload={handleDownloadPDF}
        onGenerateSummary={handleGenerateSummary}
        transcription={transcription}
        generating={isGeneratingSummary}
      />
      <Tabs defaultValue="view" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="view">View</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          {transcription.summary && <TabsTrigger value="summary">Summary</TabsTrigger>}
        </TabsList>

        <TabsContent value="view">
          <TranscriptView transcription={transcription} formatTime={formatTime} />
        </TabsContent>
        <TabsContent value="edit">
          <TranscriptEditor
            transcriptionId={transcription.id}
            originalText={transcription.text || ''}
            fileName={transcription.fileName}
            hasTimestamps={transcription.hasTimestamps}
            speakerLabels={transcription.speakerLabels}
            structuredTranscript={transcription.structuredTranscript ?? undefined}
            duration={transcription.duration}
          />
        </TabsContent>
        {transcription.summary && (
          <TabsContent value="summary">
            <SummaryTab summary={transcription.summary} keywords={keywords} actionItems={actionItems} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// --- Sub-components below ---

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p>Loading transcription...</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
      <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold mb-2">Not Found</h2>
      <p className="text-gray-500 text-center">Couldn't load transcript.</p>
      <Link href="/history">
        <Button size="sm">Back to History</Button>
      </Link>
    </div>
  );
}

function Header({ onBack, onDelete, deleting }: { onBack: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
        <ArrowLeft /> Back
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={onDelete} aria-label="Delete" disabled={deleting}>
            <Trash2 /> {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Metadata({ transcription, formatDate, formatDuration }: { transcription: Transcription; formatDate: (d: string|null)=>string; formatDuration: (s: number|null)=>string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h1 className="text-2xl font-bold mb-4">{transcription.meetingTitle || transcription.fileName}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-gray-600">
        <div><FileAudio className="inline-block mr-2"/>{transcription.fileName}</div>
        <div><Calendar className="inline-block mr-2"/>{transcription.meetingDate ? formatDate(transcription.meetingDate) : 'Unknown'}</div>
        {transcription.participants && <div><Users className="inline-block mr-2"/>{transcription.participants}</div>}
        <div><Clock className="inline-block mr-2"/>{formatDuration(transcription.duration)}</div>
      </div>
      <div className="mt-4 text-xs text-gray-500">
        <div>Uploaded: {transcription.createdAt ? formatDate(transcription.createdAt) : 'Unknown'}</div>
        {transcription.updatedAt && transcription.updatedAt !== transcription.createdAt && (
          <div>Modified: {formatDate(transcription.updatedAt)}</div>
        )}
      </div>
    </div>
  );
}

function Actions({ onDownload, onGenerateSummary, transcription, generating }: { onDownload: ()=>void; onGenerateSummary: ()=>void; transcription: Transcription; generating: boolean }) {
  return (
    <div className="flex gap-2">
      <Button onClick={onDownload} variant="outline" aria-label="Download PDF"><FileDown /> Download PDF</Button>
      {!transcription.summary && (
        <Button onClick={onGenerateSummary} disabled={generating} aria-label="Generate Summary">
          {generating ? <Loader2 className="animate-spin"/> : <MessageSquareText />} Generate Summary
        </Button>
      )}
      {transcription.language && <span className="badge"><Languages /> {transcription.language}</span>}
      {transcription.speakerLabels && (
        <span className="badge"><Users /> Speakers: {transcription.speakerCount}</span>
      )}
    </div>
  );
}

function TranscriptView({ transcription, formatTime }: { transcription: Transcription; formatTime: (s: number)=>string }) {
  // Generate a map of speaker to color for consistent coloring
  const speakerColorMap = useMemo(() => {
    if (!transcription.structuredTranscript) return {};
    
    // Color classes for different speakers
    const colorClasses = [
      { bg: 'bg-blue-100', text: 'text-blue-800' },
      { bg: 'bg-green-100', text: 'text-green-800' },
      { bg: 'bg-purple-100', text: 'text-purple-800' },
      { bg: 'bg-amber-100', text: 'text-amber-800' },
      { bg: 'bg-rose-100', text: 'text-rose-800' },
      { bg: 'bg-cyan-100', text: 'text-cyan-800' },
      { bg: 'bg-indigo-100', text: 'text-indigo-800' },
      { bg: 'bg-teal-100', text: 'text-teal-800' },
    ];
    
    // Extract unique speakers
    const speakers = Array.from(new Set(
      transcription.structuredTranscript.segments
        .filter(segment => segment.speaker)
        .map(segment => segment.speaker)
    ));
    
    // Create a map of speaker to color
    const colorMap: Record<string, {bg: string, text: string}> = {};
    speakers.forEach((speaker, index) => {
      if (speaker) {
        const colorIndex = index % colorClasses.length;
        colorMap[speaker] = colorClasses[colorIndex];
      }
    });
    
    return colorMap;
  }, [transcription.structuredTranscript]);

  // Display structured transcript segments if available
  if (transcription.structuredTranscript && transcription.structuredTranscript.segments.length) {
    console.log("Rendering structured transcript with segments:", transcription.structuredTranscript.segments.length);
    console.log("First segment:", JSON.stringify(transcription.structuredTranscript.segments[0]));
    
    return (
      <div className="space-y-3">
        {transcription.structuredTranscript.segments.map((segment, idx) => {
          const speakerColor = segment.speaker && speakerColorMap[segment.speaker] ? speakerColorMap[segment.speaker] : { bg: 'bg-gray-100', text: 'text-gray-800' };
          
          return (
            <div key={idx} className="pb-3 border-b last:border-b-0">
              <div className="flex items-center gap-2 text-xs">
                {/* Ensure start is a number before formatting */} 
                {transcription.hasTimestamps && typeof segment.start === 'number' && 
                  <span className="text-gray-500">{formatTime(segment.start)}</span>
                }
                {transcription.speakerLabels && segment.speaker && (
                  <span className={`px-2 py-0.5 ${speakerColor.bg} ${speakerColor.text} text-xs rounded-full flex items-center`}>
                    <Users className="h-3 w-3 mr-1" />
                    {segment.speaker}
                  </span>
                )}
              </div>
              {/* Add margin and subtle background color based on speaker */}
              <p className={`mt-1 p-2 rounded ${(transcription.hasTimestamps || transcription.speakerLabels) ? 'ml-2' : ''} ${segment.speaker ? `${speakerColor.bg} bg-opacity-20` : ''}`}>
                {segment.text}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: Display plain text lines, filtering empty ones
  const lines = transcription.text?.split('\n').filter(line => line.trim() !== '') ?? [];
  if (!lines.length) return (
    <div className="text-center py-12 bg-gray-50 rounded-md">
      <MessageSquareText className="h-12 w-12 text-gray-300 mb-3" />
      <p>No transcript available</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => {
        const tsMatch = line.match(/\[\d+:\d+\]/);
        if (tsMatch) {
          const ts = tsMatch[0];
          const rest = line.replace(ts, '').trim();
          const speakerMatch = rest.match(/^([^:]+):\s*(.*)$/);
          if (speakerMatch) {
            const [, sp, txt] = speakerMatch;
            // Try to use the color map if the speaker matches one we know
            const speakerColor = speakerColorMap[sp] || { bg: 'bg-blue-100', text: 'text-blue-800' };
            
            return (
              <div key={idx} className="pb-3 border-b last:border-b-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{ts}</span>
                  <span className={`px-2 py-0.5 ${speakerColor.bg} ${speakerColor.text} text-xs rounded-full flex items-center`}>
                    <Users className="h-3 w-3 mr-1" />
                    {sp}
                  </span>
                </div>
                <p className={`mt-1 p-2 rounded ml-2 ${speakerColor.bg} bg-opacity-20`}>{txt}</p>
              </div>
            );
          }
          return <p key={idx}><span className="text-xs text-gray-500">{ts}</span> {rest}</p>;
        }
        return <p key={idx}>{line}</p>;
      })}
    </div>
  );
}

function SummaryTab({ summary, keywords, actionItems }: { summary: string; keywords: string[]; actionItems: string[] }) {
  return (
    <div className="space-y-6">
      <div className="p-5 bg-white rounded-md border"><h3 className="text-lg mb-3">Summary</h3><p>{summary}</p></div>
      {keywords.length > 0 && <div className="p-5 bg-white rounded-md border"><h3 className="text-lg mb-3">Keywords</h3><div className="flex flex-wrap gap-2">{keywords.map((k,i)=><span key={i} className="badge">{k}</span>)}</div></div>}
      {actionItems.length > 0 && <div className="p-5 bg-white rounded-md border"><h3 className="text-lg mb-3">Action Items</h3><ul className="space-y-2">{actionItems.map((ai,i)=><li key={i} className="flex items-start"><CheckSquare className="mr-2"/>{ai}</li>)}</ul></div>}
    </div>
  );
}
