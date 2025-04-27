import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2,
  Calendar,
  Users,
  Clock,
  MessageSquare,
  Search,
  Languages,
  Mic,
  Timer,
  FileAudio,
  Trash2,
  CheckCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiRequest } from "@/lib/queryClient";

// Shared language map
const LANGUAGE_MAP: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean"
};

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
  language: string | null;
  summary: string | null;
  keywords: string | null;
  translatedText: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  actionItems: string | null;
}

// Debounce hook
function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function TranscriptionHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Data fetch
  const {
    data: transcriptions = [],
    isLoading,
    error
  } = useQuery({
    queryKey: ["/api/transcriptions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/transcriptions");
      const data = await response.json();
      return data as Transcription[];
    }
  });

  // Mutations
  const deleteMut = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => apiRequest("DELETE", `/api/transcriptions/${id}`))),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["/api/transcriptions"] });
      const previous = queryClient.getQueryData<Transcription[]>(["/api/transcriptions"]);
      queryClient.setQueryData(["/api/transcriptions"], (prev: Transcription[] | undefined) =>
        prev?.filter(t => !ids.includes(t.id)) || []
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      queryClient.setQueryData(["/api/transcriptions"], context?.previous);
      toast({ title: "Error deleting", description: "Could not delete items", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transcriptions"] });
      setIsSelectionMode(false);
      setSelectedItems([]);
      setIsDeleteDialogOpen(false);
    },
    onSuccess: (_data, ids) => {
      toast({ title: "Deleted", description: `Removed ${ids.length} items.` });
    }
  });

  // Handlers
  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(s => !s);
    setSelectedItems([]);
  }, []);

  const toggleItem = useCallback((id: number) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedItems(prev =>
      prev.length === filtered.length ? [] : filtered.map(t => t.id)
    );
  }, [/* eslint-disable-line */]);

  const confirmDelete = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);
  const performDelete = useCallback(() => {
    deleteMut.mutate(selectedItems);
  }, [deleteMut, selectedItems]);

  // Filters & sorting
  const filtered = useMemo(() => {
    // Check if transcriptions is an array before filtering
    if (!Array.isArray(transcriptions)) {
      return [];
    }
    
    return transcriptions.filter(t => {
      const term = debouncedSearch.toLowerCase();
      return t.meetingTitle?.toLowerCase().includes(term) ||
             t.fileName.toLowerCase().includes(term) ||
             t.participants?.toLowerCase().includes(term) ||
             t.text?.toLowerCase().includes(term);
    });
  }, [transcriptions, debouncedSearch]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) =>
      (new Date(b.meetingDate || b.createdAt || "")).getTime() -
      (new Date(a.meetingDate || a.createdAt || "")).getTime()
    ), [filtered]
  );

  // Utils
  const formatFileSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  }, []);

  const formatDateStr = useCallback((d: string|null) =>
    d ? format(new Date(d), "MMMM d, yyyy") : "Unknown"
  , []);

  const estimateDuration = useCallback((t: Transcription) =>
    t.duration != null
      ? `${Math.floor(t.duration/60)}:${String(t.duration%60).padStart(2,'0')}`
      : t.text
        ? `${Math.round((t.text.length/5)/150 * 60)}s`
        : "Unknown"
  , []);

  // Render
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">Meeting Transcriptions</h1>
        <Button onClick={toggleSelectionMode} variant="outline">
          {isSelectionMode ? "Cancel" : "Select Items"}
        </Button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 text-gray-400" />
        <Input
          className="pl-10"
          placeholder="Search transcripts..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          aria-label="Search transcriptions"
        />
      </div>

      {isLoading ? (
        Array.from({ length: 3 }).map((_,i)=>(
          <Card key={i} className="animate-pulse h-32 mb-4" />
        ))
      ) : error ? (
        <div className="text-red-600">Failed to load. Try again.</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <MessageSquare className="mx-auto mb-2 h-8 w-8" />
          {debouncedSearch ? "No matches" : "No transcriptions yet"}
        </div>
      ) : (
        sorted.map(t => (
          <TranscriptionCard
            key={t.id}
            t={t}
            isSelectionMode={isSelectionMode}
            selected={selectedItems.includes(t.id)}
            onToggle={() => toggleItem(t.id)}
            estimateDuration={estimateDuration}
            formatFileSize={formatFileSize}
            formatDate={formatDateStr}
          />
        ))
      )}

      {isSelectionMode && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2">
          <Button onClick={selectAll} disabled={filtered.length===0}>
            {selectedItems.length===filtered.length ? "Deselect All" : "Select All"}
          </Button>
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={selectedItems.length===0}>
                {deleteMut.isPending ? "Deleting..." : `Delete (${selectedItems.length})`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanently delete selected transcripts?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={performDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// Extracted sub-component
function TranscriptionCard({
  t,
  isSelectionMode,
  selected,
  onToggle,
  estimateDuration,
  formatFileSize,
  formatDate
}: {
  t: Transcription;
  isSelectionMode: boolean;
  selected: boolean;
  onToggle: () => void;
  estimateDuration: (t: Transcription) => string;
  formatFileSize: (b: number) => string;
  formatDate: (d: string|null) => string;
}) {
  return (
    <Card
      className={`p-4 mb-4 hover:shadow transition-shadow ${isSelectionMode && selected ? 'bg-blue-50' : ''}`}
      onClick={() => isSelectionMode && onToggle()}
      role={isSelectionMode ? 'button' : undefined}
      aria-pressed={isSelectionMode ? selected : undefined}
      aria-label={`Transcription: ${t.meetingTitle || t.fileName}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h2 className="font-semibold text-lg line-clamp-1">{t.meetingTitle || t.fileName}</h2>
          <div className="flex flex-wrap gap-3 text-sm text-gray-600 mt-2">
            <div><Calendar className="inline mr-1" />{formatDate(t.meetingDate || t.createdAt)}</div>
            {t.participants && <div><Users className="inline mr-1" />{t.participants}</div>}
            {t.text && <div><Clock className="inline mr-1" />{estimateDuration(t)}</div>}
          </div>
        </div>
        {isSelectionMode ? (
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={selected ? 'Deselect' : 'Select'}
          />
        ) : (
          <Link href={`/transcription/${t.id}`}>
            <Button size="sm" variant="outline" aria-label="View Details">View</Button>
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-3 text-xs">
        {t.summary && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Summary Available
          </Badge>
        )}
        {t.speakerLabels && t.speakerCount && t.speakerCount > 1 && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {t.speakerCount} Speakers
          </Badge>
        )}
        {t.language && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Languages className="h-3 w-3" /> {LANGUAGE_MAP[t.language] || t.language}
          </Badge>
        )}
      </div>
      {t.summary && (
        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
          {t.summary}
        </p>
      )}
      
      {/* Transcript text preview with scrollable container */}
      {t.text && (
        <div className="mt-2">
          <details className="text-sm group">
            <summary className="cursor-pointer text-primary hover:text-primary/80 font-medium flex items-center">
              <span className="mr-1">View Transcript</span>
              <span className="text-xs text-gray-500 group-open:hidden">(click to expand)</span>
              <span className="text-xs text-gray-500 hidden group-open:inline">(click to collapse)</span>
            </summary>
            <div className="mt-2 border rounded">
              <ScrollArea className="h-64 w-full">
                <div className="p-3">
                  <p className="text-sm text-gray-700 whitespace-pre-line break-words">
                    {t.text}
                  </p>
                </div>
              </ScrollArea>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}