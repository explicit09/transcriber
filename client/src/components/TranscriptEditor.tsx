import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Save, 
  Copy, 
  RotateCcw, 
  Download,
  FileText,
  File,
  Clock,
  User
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

import { StructuredTranscript, TranscriptSegment } from "@shared/schema";

interface TranscriptEditorProps {
  transcriptionId: number;
  originalText: string;
  fileName: string;
  hasTimestamps?: boolean;
  speakerLabels?: boolean;
  structuredTranscript?: StructuredTranscript;
  duration?: number;
}

export default function TranscriptEditor({ 
  transcriptionId, 
  originalText,
  fileName,
  hasTimestamps = false,
  speakerLabels = false,
  structuredTranscript,
  duration
}: TranscriptEditorProps) {
  const [editedText, setEditedText] = useState(originalText);
  const [showDiff, setShowDiff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'plain' | 'structured'>('plain');
  const { toast } = useToast();
  
  // Parse structured transcript if available
  const parsedTranscript = useMemo(() => {
    // If structuredTranscript is provided directly, use it
    if (structuredTranscript) {
      return structuredTranscript;
    }
    
    // If hasTimestamps or speakerLabels is true, try to parse from text
    if ((hasTimestamps || speakerLabels) && originalText) {
      // First try direct JSON parsing in case it's already a JSON structure
      try {
        return JSON.parse(originalText) as StructuredTranscript;
      } catch (e) {
        // If JSON parsing fails, try to extract structured data from text format
        try {
          // Check if the text has timestamp patterns
          const hasStructuredContent = originalText && (
            originalText.includes('[') && 
            (originalText.includes(']: ') || originalText.includes('Speaker') || 
            originalText.match(/\[\d+:\d+\]/))
          );
          
          if (hasStructuredContent) {
            // Try to extract segments using regex patterns
            // Format: [00:00] Speaker 1: This is what they said
            let segments: TranscriptSegment[] = [];
            let timeMatches = originalText.match(/\[([0-9:]+)\](?:\s*([^:]+))?:\s*(.+?)(?=\n\[|$)/gs);
            
            // If no matches found, try another common format
            // Format: Speaker 1 [00:00]: This is what they said
            if (!timeMatches || timeMatches.length === 0) {
              timeMatches = originalText.match(/([^[]+)\s*\[([0-9:]+)\]:\s*(.+?)(?=\n[^[]+\s*\[|$)/gs);
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
                  speakerCount: speakerLabels ? (new Set(segments.map(s => s.speaker).filter(Boolean))).size : undefined,
                  duration,
                  language: undefined
                }
              };
            }
          }
        } catch (parseError) {
          console.error("Error parsing structured format from text:", parseError);
        }
        
        // If all parsing attempts fail, return null
        return null;
      }
    }
    
    return null;
  }, [structuredTranscript, originalText, hasTimestamps, speakerLabels, duration]);
  
  // Text analytics
  const wordCount = editedText.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = editedText.length;
  const sentenceCount = editedText.split(/[.!?]+/).filter(Boolean).length;
  
  // Check for filler words
  const fillerWords = ["um", "uh", "like", "you know", "so", "actually", "basically"];
  const fillerWordCounts = fillerWords.reduce((acc, word) => {
    try {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = editedText.match(regex);
      if (matches) {
        acc[word] = matches.length;
      }
    } catch (e) {
      console.error(`Error matching pattern for word: ${word}`, e);
    }
    return acc;
  }, {} as Record<string, number>);
  
  const totalFillerWords = Object.values(fillerWordCounts).reduce((sum, count) => sum + count, 0);
  
  // Save edited transcript
  const handleSave = async () => {
    if (editedText === originalText) {
      toast({
        title: "No changes detected",
        description: "The transcript has not been modified.",
        variant: "default",
      });
      return;
    }
    
    setIsSaving(true);
    try {
      await apiRequest("PATCH", `/api/transcriptions/${transcriptionId}`, {
        text: editedText
      });
      
      // Invalidate the cache to refresh the data
      queryClient.invalidateQueries({
        queryKey: [`/api/transcriptions/${transcriptionId}`]
      });
      
      toast({
        title: "Transcript saved",
        description: "Your changes have been saved successfully.",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Failed to save",
        description: "There was an error saving your changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(editedText);
    toast({
      title: "Copied to clipboard",
      description: "The transcript has been copied to your clipboard.",
      variant: "default",
    });
  };
  
  // Reset to original
  const handleReset = () => {
    if (editedText !== originalText) {
      setEditedText(originalText);
      toast({
        title: "Transcript reset",
        description: "Changes have been discarded and the original transcript restored.",
        variant: "default",
      });
    }
  };
  
  // Download as TXT
  const downloadAsTxt = () => {
    const element = document.createElement("a");
    const file = new Blob([editedText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${sanitizeFileName(fileName)}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast({
      title: "Downloaded as TXT",
      description: "The transcript has been downloaded as a text file.",
      variant: "default",
    });
  };
  
  // Download as structured text with timestamps and speakers
  const downloadStructuredText = () => {
    if (!parsedTranscript) return;
    
    setIsExporting(true);
    
    try {
      // Format the transcript with timestamps and speakers
      let formattedText = "";
      
      if (parsedTranscript.metadata) {
        formattedText += `Duration: ${formatTimestamp(parsedTranscript.metadata.duration || 0)}\n`;
        
        if (parsedTranscript.metadata.speakerCount) {
          formattedText += `Speakers: ${parsedTranscript.metadata.speakerCount}\n`;
        }
        
        if (parsedTranscript.metadata.language) {
          formattedText += `Language: ${parsedTranscript.metadata.language}\n`;
        }
        
        formattedText += "\n";
      }
      
      // Format each segment with timestamp and speaker
      parsedTranscript.segments.forEach((segment) => {
        const timestamp = `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}]`;
        const speaker = segment.speaker ? `[${segment.speaker}]` : "";
        formattedText += `${timestamp} ${speaker}\n${segment.text}\n\n`;
      });
      
      // Create and download the file
      const element = document.createElement("a");
      const file = new Blob([formattedText], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${sanitizeFileName(fileName)}_with_timestamps.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      toast({
        title: "Downloaded structured transcript",
        description: "Transcript with timestamps has been downloaded as a text file.",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export structured transcript. Please try again.",
        variant: "destructive",
      });
      console.error("Error exporting structured transcript:", error);
    } finally {
      setIsExporting(false);
    }
  };
  
  // Sanitize filename for download
  const sanitizeFileName = (name: string) => {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };
  
  // Format timestamp from seconds to MM:SS format
  const formatTimestamp = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center space-y-2 sm:space-y-0 mb-2">
        <div className="text-sm text-gray-500 space-x-3">
          <span>{wordCount} words</span>
          <span>{characterCount} characters</span>
          <span>{sentenceCount} sentences</span>
          {duration && <span>{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')} duration</span>}
          {totalFillerWords > 0 && (
            <span>{totalFillerWords} filler words</span>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {(parsedTranscript || hasTimestamps) && (
            <div className="flex items-center space-x-2">
              <Switch
                id="view-mode"
                checked={viewMode === 'structured'}
                onCheckedChange={(checked) => setViewMode(checked ? 'structured' : 'plain')}
              />
              <Label htmlFor="view-mode">Show timestamps{speakerLabels ? ' & speakers' : ''}</Label>
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Switch
              id="show-diff"
              checked={showDiff}
              onCheckedChange={setShowDiff}
            />
            <Label htmlFor="show-diff">Show changes</Label>
          </div>
        </div>
      </div>
      
      {showDiff ? (
        <div className="min-h-[400px] border rounded-md p-3 font-mono text-sm overflow-auto whitespace-pre-wrap">
          {originalText.split('').map((char, i) => {
            // Simple character-by-character diff visualization
            const editedChar = editedText[i];
            
            if (i >= editedText.length) {
              // Character was deleted
              return <span key={i} className="bg-red-100 line-through">{char}</span>;
            } else if (char !== editedChar) {
              // Character was changed
              return <span key={i} className="bg-yellow-100">{editedChar}</span>;
            }
            
            return <span key={i}>{char}</span>;
          })}
          
          {editedText.length > originalText.length && (
            // Added new characters
            <span className="bg-green-100">
              {editedText.slice(originalText.length)}
            </span>
          )}
        </div>
      ) : viewMode === 'structured' && parsedTranscript ? (
        <div className="min-h-[400px] border rounded-md p-3 overflow-auto">
          {/* Generate a map of speaker to color for consistent coloring */}
          {(() => {
            // Extract unique speakers
            const speakers = Array.from(new Set(
              parsedTranscript.segments
                .filter(segment => segment.speaker)
                .map(segment => segment.speaker)
            ));
            
            // Define a set of distinguishable colors for speakers
            const speakerColors = [
              { bg: 'bg-blue-100', text: 'text-blue-800' },
              { bg: 'bg-green-100', text: 'text-green-800' },
              { bg: 'bg-purple-100', text: 'text-purple-800' },
              { bg: 'bg-amber-100', text: 'text-amber-800' },
              { bg: 'bg-rose-100', text: 'text-rose-800' },
              { bg: 'bg-cyan-100', text: 'text-cyan-800' },
              { bg: 'bg-indigo-100', text: 'text-indigo-800' },
              { bg: 'bg-teal-100', text: 'text-teal-800' },
              { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800' },
            ];
            
            // Create a map of speaker to color
            const speakerColorMap = new Map();
            speakers.forEach((speaker, index) => {
              const colorIndex = index % speakerColors.length;
              speakerColorMap.set(speaker, speakerColors[colorIndex]);
            });
            
            return parsedTranscript.segments.map((segment, index) => {
              const speakerColor = segment.speaker ? speakerColorMap.get(segment.speaker) : null;
              
              return (
                <div key={index} className="mb-4 pb-3 border-b last:border-b-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-semibold text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                    </div>
                    {segment.speaker && (
                      <div className={`px-2 py-0.5 ${speakerColor.bg} ${speakerColor.text} text-xs font-medium rounded-full flex items-center`}>
                        <User className="h-3 w-3 mr-1" />
                        {segment.speaker}
                      </div>
                    )}
                  </div>
                  <div className={`text-sm p-2 rounded ${segment.speaker ? speakerColor.bg + ' bg-opacity-20' : ''}`}>
                    {segment.text}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <Textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="min-h-[400px] font-mono text-sm"
          placeholder="The transcript will appear here. Edit as needed."
        />
      )}
      
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <div className="flex space-x-2">
          <Button onClick={handleSave} disabled={isSaving || editedText === originalText}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
          
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleReset}
            disabled={editedText === originalText}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
        
        <div className="flex space-x-2 ml-auto">
          <Button variant="secondary" onClick={downloadAsTxt}>
            <FileText className="h-4 w-4 mr-2" />
            Export TXT
          </Button>
          
          {(parsedTranscript || hasTimestamps) && (
            <Button 
              variant="secondary" 
              onClick={downloadStructuredText}
              disabled={isExporting}
            >
              <Clock className="h-4 w-4 mr-2" />
              {isExporting ? "Exporting..." : "Export with Timestamps"}
            </Button>
          )}
        </div>
      </div>
      
      {totalFillerWords > 0 && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium mb-2">Filler Word Analysis</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(fillerWordCounts).map(([word, count]) => 
              count > 0 && (
                <div key={word} className="px-2 py-1 bg-gray-200 rounded text-xs">
                  "{word}": {count} times
                </div>
              )
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Reducing filler words can make communications clearer and more professional.
          </p>
        </div>
      )}
    </div>
  );
}