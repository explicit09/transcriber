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
  CheckCircle,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState("transcriptions"); // Default to transcriptions tab

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
      prev.length === sorted.length ? [] : sorted.map(t => t.id)
    );
  }, [sorted]);

  const confirmDelete = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);
  const performDelete = useCallback(() => {
    deleteMut.mutate(selectedItems);
  }, [deleteMut, selectedItems]);

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
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-[calc(100vh-64px)] pb-10">
      <div className="container mx-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
          <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-600">
                  Meeting Transcriptions
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                  Browse and manage your meeting recordings and transcriptions
                </p>
              </div>
              <Button 
                onClick={toggleSelectionMode} 
                variant="outline"
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                {isSelectionMode ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel Selection
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Select Items
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <div className="bg-white rounded-lg shadow-sm p-2 flex items-center">
            <Search className="ml-2 text-blue-400" />
            <Input
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pl-2"
              placeholder="Search by title, participants, or content..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Search transcriptions"
            />
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-white shadow-sm mb-2">
            <TabsTrigger 
              value="transcriptions" 
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              <FileAudio className="h-4 w-4 mr-2" />
              Transcriptions
            </TabsTrigger>
            <TabsTrigger 
              value="speakers" 
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              <Users className="h-4 w-4 mr-2" />
              Speaker Analysis
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="transcriptions" className="mt-4">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_,i)=>(
                  <Card key={i} className="animate-pulse h-32 mb-4 border-0 shadow-sm bg-white/70" />
                ))}
              </div>
            ) : error ? (
              <div className="bg-red-50 text-red-600 p-6 rounded-lg border border-red-100 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="font-semibold mb-1">Failed to load transcriptions</h3>
                  <p className="text-sm">Please try again or refresh the page</p>
                </div>
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-16 px-6 bg-white rounded-xl shadow-sm">
                <MessageSquare className="mx-auto mb-4 h-12 w-12 text-blue-300" />
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {debouncedSearch ? "No matching transcriptions" : "No transcriptions yet"}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto mb-6">
                  {debouncedSearch 
                    ? "Try adjusting your search terms or clear the search to see all transcriptions."
                    : "Start by uploading an audio recording or using the recording feature to create your first transcription."}
                </p>
                {debouncedSearch && (
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchTerm("")}
                    className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {sorted.map(t => (
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
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="speakers" className="mt-4">
            {sorted.some(t => t.speakerLabels && t.speakerCount && t.speakerCount > 1) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sorted
                  .filter(t => t.speakerLabels && t.speakerCount && t.speakerCount > 1)
                  .map(t => (
                    <Card key={t.id} className="border-0 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
                      <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-blue-700 flex items-center">
                          <Users className="h-5 w-5 mr-2 text-blue-500" />
                          {t.meetingTitle || t.fileName}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {formatDateStr(t.meetingDate || t.createdAt)} 
                          <span className="flex items-center text-blue-500 font-medium">
                            <Users className="h-3 w-3 mr-1" /> 
                            {t.speakerCount} speakers
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-4 space-y-2">
                          <div className="grid grid-cols-4 gap-2">
                            {Array.from({ length: Math.min(4, t.speakerCount || 0) }).map((_, i) => (
                              <div key={i} className="bg-blue-50 rounded-full h-10 w-10 flex items-center justify-center text-blue-700 font-semibold">
                                S{i+1}
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-gray-600">
                            Analyze speaker patterns, distribution, and similarities between detected voices
                          </p>
                        </div>
                        <Link href={`/transcription/${t.id}`} className="w-full block">
                          <Button size="sm" className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                            View Speaker Analysis
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))
              }
              </div>
            ) : (
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-400 to-cyan-400"></div>
                <CardHeader className="bg-white">
                  <CardTitle className="flex items-center text-blue-700">
                    <Users className="h-5 w-5 mr-2 text-blue-500" />
                    Speaker Analysis
                  </CardTitle>
                  <CardDescription>
                    No transcriptions with multiple speakers found
                  </CardDescription>
                </CardHeader>
                <CardContent className="bg-blue-50/50">
                  <div className="flex flex-col items-center justify-center p-8 text-center text-gray-600">
                    <div className="bg-blue-100 rounded-full p-6 mb-4">
                      <Users className="h-12 w-12 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Speaker Analysis Available</h3>
                    <p className="max-w-md">
                      Upload a recording with multiple speakers to see advanced speaker analytics, 
                      distribution, and similarity analysis.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {isSelectionMode && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-white rounded-full shadow-lg px-4 py-2 flex gap-3 border border-gray-100">
              <Button 
                onClick={selectAll} 
                disabled={sorted.length===0} 
                variant="outline" 
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {selectedItems.length===sorted.length ? "Deselect All" : "Select All"}
              </Button>
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    disabled={selectedItems.length===0}
                  >
                    {deleteMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete ({selectedItems.length})
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      You're about to permanently delete {selectedItems.length} transcription{selectedItems.length !== 1 ? 's' : ''}. 
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={performDelete}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </div>
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
      className={`border-0 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg cursor-pointer ${isSelectionMode && selected ? 'bg-blue-50/70' : 'bg-white'}`}
      onClick={() => isSelectionMode && onToggle()}
      role={isSelectionMode ? 'button' : undefined}
      aria-pressed={isSelectionMode ? selected : undefined}
      aria-label={`Transcription: ${t.meetingTitle || t.fileName}`}
    >
      <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
      <div className="p-5">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div className="flex-grow">
            <div className="flex items-start">
              <div className="mr-4 bg-blue-100 rounded-full p-3 hidden sm:flex">
                {t.text ? (
                  <FileAudio className="h-6 w-6 text-blue-500" />
                ) : (
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                )}
              </div>
              <div className="flex-grow">
                <h2 className="font-semibold text-lg text-gray-900 line-clamp-1">
                  {t.meetingTitle || t.fileName}
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600 mt-2">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1.5 text-blue-500" />
                    {formatDate(t.meetingDate || t.createdAt)}
                  </div>
                  {t.participants && (
                    <div className="flex items-center">
                      <Users className="h-4 w-4 mr-1.5 text-blue-500" />
                      <span className="line-clamp-1 max-w-[150px]">{t.participants}</span>
                    </div>
                  )}
                  {t.text && (
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1.5 text-blue-500" />
                      {estimateDuration(t)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-4">
              {t.summary && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Summary
                </Badge>
              )}
              {t.speakerLabels && t.speakerCount && t.speakerCount > 1 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200 flex items-center gap-1">
                  <Users className="h-3 w-3" /> {t.speakerCount} Speakers
                </Badge>
              )}
              {t.language && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 flex items-center gap-1">
                  <Languages className="h-3 w-3" /> {LANGUAGE_MAP[t.language] || t.language}
                </Badge>
              )}
              {t.actionItems && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Action Items
                </Badge>
              )}
            </div>

            {t.summary && (
              <div className="mt-4 bg-gray-50 p-3 rounded-md">
                <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-blue-500" /> Summary
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {t.summary}
                </p>
              </div>
            )}
          </div>
          
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-3">
            {isSelectionMode ? (
              <div className="p-2 border border-blue-200 rounded-md">
                <Checkbox
                  checked={selected}
                  onCheckedChange={onToggle}
                  className="w-5 h-5 text-blue-500"
                  aria-label={selected ? 'Deselect' : 'Select'}
                />
              </div>
            ) : (
              <Link href={`/transcription/${t.id}`}>
                <Button variant="outline" className="bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100">
                  <FileAudio className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </Link>
            )}
            
            {/* Status indicator */}
            <div className="flex items-center text-xs">
              {t.status === 'completed' ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>
              ) : t.status === 'processing' ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
                </Badge>
              ) : t.status === 'error' ? (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Error</Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Pending</Badge>
              )}
            </div>
          </div>
        </div>
      
        {/* Transcript text preview with scrollable container */}
        {t.text && (
          <div className="mt-4">
            <details className="text-sm group">
              <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium flex items-center">
                <span className="mr-1">View Transcript</span>
                <span className="text-xs text-gray-500 group-open:hidden">(click to expand)</span>
                <span className="text-xs text-gray-500 hidden group-open:inline">(click to collapse)</span>
              </summary>
              <div className="mt-2 border rounded-md border-blue-200">
                <ScrollArea className="h-64 w-full">
                  <div className="p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-line break-words">
                      {t.text}
                    </p>
                  </div>
                </ScrollArea>
              </div>
            </details>
          </div>
        )}
      </div>
    </Card>
  );
}