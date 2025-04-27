import React, { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Transcription } from '@/types/transcription';
import { 
  Save, 
  Copy, 
  RotateCcw, 
  Download,
  FileText,
  File,
  Clock,
  User,
  Loader2,
  Pencil,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatTimestamp } from '@/lib/utils';

import { StructuredTranscript, TranscriptSegment } from "@shared/schema";

interface TranscriptEditorProps {
  transcription: Transcription;
  onSave: (text: string) => Promise<void>;
  readOnly?: boolean;
}

const formSchema = z.object({
  text: z.string().min(1, { message: 'Transcript cannot be empty' }),
});

export function TranscriptEditor({ transcription, onSave, readOnly = false }: TranscriptEditorProps) {
  const [originalText, setOriginalText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showStripped, setShowStripped] = useState(false);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'plain' | 'structured'>('plain');
  const { toast } = useToast();
  
  // Initialize form with transcript text
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { text: '' },
  });

  const watchText = form.watch('text');
  const hasChanges = originalText !== watchText;

  // Parse the structured transcript and generate editable text
  const parsedTranscript = useMemo(() => {
    try {
      if (!transcription.structuredTranscript || 
          !Array.isArray(transcription.structuredTranscript.segments) || 
          transcription.structuredTranscript.segments.length === 0) {
        console.info('No structured transcript available, using plain text');
        return { text: transcription.text || '', isStructured: false };
      }

      // Validate segments
      const validSegments = transcription.structuredTranscript.segments.filter(
        segment => typeof segment === 'object' && 
                  segment !== null && 
                  typeof segment.text === 'string' && 
                  segment.text.trim() !== '' &&
                  (segment.start === undefined || typeof segment.start === 'number') &&
                  (segment.end === undefined || typeof segment.end === 'number')
      );

      if (validSegments.length === 0) {
        console.warn('No valid segments found in structured transcript');
        return { text: transcription.text || '', isStructured: false };
      }

      // Check if speaker labels are present in segments
      const hasSpeakers = validSegments.some(segment => segment.speaker);
      
      // Generate editable text from segments
      let text = '';
      validSegments.forEach((segment, index) => {
        // Add timestamp if available
        if (transcription.hasTimestamps && typeof segment.start === 'number') {
          const mins = Math.floor(segment.start / 60);
          const secs = Math.floor(segment.start % 60);
          text += `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}] `;
        }
        
        // Add speaker if available
        if (segment.speaker && hasSpeakers) {
          text += `${segment.speaker}: `;
        }
        
        // Add the segment text
        text += segment.text.trim();
        
        // Add a newline between segments unless it's the last one
        if (index < validSegments.length - 1) {
          text += '\n\n';
        }
      });
      
      return { text, isStructured: true };
    } catch (error) {
      console.error('Error parsing structured transcript:', error);
      return { text: transcription.text || '', isStructured: false };
    }
  }, [transcription]);

  // Clean text function - strips unwanted characters and normalizes line breaks
  const cleanText = (text: string): string => {
    if (!showStripped) return text;
    
    // Remove various types of special characters and normalize spacing
    let cleaned = text
      // Replace multiple spaces with a single space
      .replace(/\s+/g, ' ')
      // Replace multiple newlines with double newlines
      .replace(/\n{3,}/g, '\n\n')
      // Strip HTML tags
      .replace(/<[^>]*>/g, '')
      // Normalize quotes
      .replace(/["""]/g, '"')
      .replace(/['']/g, "'")
      // Remove weird Unicode characters (except for basic punctuation and symbols)
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}]/gu, '')
      .trim();
    
    // Preserve timestamps and speaker labels format if enabled
    if (preserveStructure) {
      // Ensure speaker labels are properly formatted with a colon
      cleaned = cleaned.replace(/^([A-Za-z\s]+)(\s+)(?!:)/gm, '$1: ');
      
      // Ensure timestamps are properly formatted
      cleaned = cleaned.replace(/\[(\d+)[:.，](\d+)\]/g, '[$1:$2]');
    }
    
    return cleaned;
  };

  // Set initial text when transcription changes
  useEffect(() => {
    const initialText = parsedTranscript.text;
    form.reset({ text: initialText });
    setOriginalText(initialText);
  }, [parsedTranscript, form]);

  // Handle saving transcript changes
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (loading || readOnly) return;
    
    setLoading(true);
    try {
      await onSave(values.text);
      setOriginalText(values.text);
    } catch (error) {
      console.error('Error saving transcript:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle resetting to original text
  const handleReset = () => {
    form.reset({ text: originalText });
  };

  // Text analytics
  const wordCount = originalText.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = originalText.length;
  const sentenceCount = originalText.split(/[.!?]+/).filter(Boolean).length;
  
  // Check for filler words
  const fillerWords = ["um", "uh", "like", "you know", "so", "actually", "basically"];
  const fillerWordCounts = fillerWords.reduce((acc, word) => {
    try {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = originalText.match(regex);
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
    if (originalText === watchText) {
      toast({
        title: "No changes detected",
        description: "The transcript has not been modified.",
        variant: "default",
      });
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(watchText);
      setOriginalText(watchText);
      
      // Invalidate the cache to refresh the data
      queryClient.invalidateQueries({
        queryKey: [`/api/transcriptions/${transcription.id}`]
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
    navigator.clipboard.writeText(watchText);
    toast({
      title: "Copied to clipboard",
      description: "The transcript has been copied to your clipboard.",
      variant: "default",
    });
  };
  
  // Download as TXT
  const downloadAsTxt = () => {
    const element = document.createElement("a");
    const file = new Blob([watchText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${sanitizeFileName(transcription.fileName)}.txt`;
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
    if (!parsedTranscript.isStructured) return;
    
    setIsExporting(true);
    
    try {
      // Format the transcript with timestamps and speakers
      let formattedText = "";
      
      if (transcription.structuredTranscript.metadata) {
        formattedText += `Duration: ${formatTimestamp(transcription.structuredTranscript.metadata.duration || 0)}\n`;
        
        if (transcription.structuredTranscript.metadata.speakerCount) {
          formattedText += `Speakers: ${transcription.structuredTranscript.metadata.speakerCount}\n`;
        }
        
        if (transcription.structuredTranscript.metadata.language) {
          formattedText += `Language: ${transcription.structuredTranscript.metadata.language}\n`;
        }
        
        formattedText += "\n";
      }
      
      // Format each segment with timestamp and speaker
      transcription.structuredTranscript.segments.forEach((segment) => {
        const timestamp = `[${formatTimestamp(segment.start)} - ${formatTimestamp(segment.end)}]`;
        const speaker = segment.speaker ? `[${segment.speaker}]` : "";
        formattedText += `${timestamp} ${speaker}\n${segment.text}\n\n`;
      });
      
      // Create and download the file
      const element = document.createElement("a");
      const file = new Blob([formattedText], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = `${sanitizeFileName(transcription.fileName)}_with_timestamps.txt`;
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Edit Transcript</CardTitle>
        <CardDescription>
          Make changes to the transcript text, preserving timestamps and speaker labels.
        </CardDescription>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            <Switch 
              id="showStripped"
              checked={showStripped}
              onCheckedChange={setShowStripped}
              disabled={readOnly}
            />
            <label htmlFor="showStripped" className="text-sm font-medium">
              Clean text
            </label>
          </div>
          {showStripped && (
            <div className="flex items-center space-x-2">
              <Switch 
                id="preserveStructure"
                checked={preserveStructure}
                onCheckedChange={setPreserveStructure}
                disabled={readOnly}
              />
              <label htmlFor="preserveStructure" className="text-sm font-medium">
                Preserve structure
              </label>
            </div>
          )}
        </div>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent>
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={cleanText(field.value)}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="font-mono min-h-[600px] resize-y"
                      placeholder={readOnly ? "No transcript available" : "Enter transcript text here..."}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormDescription>
                    {parsedTranscript.isStructured 
                      ? "Structured transcript detected. Edit carefully to preserve timestamps and speaker labels."
                      : "Plain text transcript. Add timestamps [MM:SS] and speaker labels 'Speaker: ' to improve readability."}
                  </FormDescription>
                </FormItem>
              )}
            />
          </CardContent>
          
          {!readOnly && (
            <CardFooter className="flex justify-between">
              <Button 
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || loading}
              >
                Reset
              </Button>
              <Button 
                type="submit"
                disabled={!hasChanges || loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardFooter>
          )}
        </form>
      </Form>
      
      <div className="flex flex-col sm:flex-row justify-between sm:items-center space-y-2 sm:space-y-0 mb-2">
        <div className="text-sm text-gray-500 space-x-3">
          <span>{wordCount} words</span>
          <span>{characterCount} characters</span>
          <span>{sentenceCount} sentences</span>
          {transcription.duration && <span>{Math.floor(transcription.duration / 60)}:{(transcription.duration % 60).toString().padStart(2, '0')} duration</span>}
          {totalFillerWords > 0 && (
            <span>{totalFillerWords} filler words</span>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Enable structured view only if parsedTranscript is valid */}
          {parsedTranscript.isStructured && (
            <div className="flex items-center space-x-2">
              <Switch
                id="view-mode"
                checked={viewMode === 'structured'}
                onCheckedChange={(checked) => setViewMode(checked ? 'structured' : 'plain')}
              />
              <Label htmlFor="view-mode">Show timestamps</Label>
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
            const editedChar = watchText[i];
            
            if (i >= watchText.length) {
              // Character was deleted
              return <span key={i} className="bg-red-100 line-through">{char}</span>;
            } else if (char !== editedChar) {
              // Character was changed
              return <span key={i} className="bg-yellow-100">{editedChar}</span>;
            }
            
            return <span key={i}>{char}</span>;
          })}
          
          {watchText.length > originalText.length && (
            // Added new characters
            <span className="bg-green-100">
              {watchText.slice(originalText.length)}
            </span>
          )}
        </div>
      ) : viewMode === 'structured' && parsedTranscript.isStructured ? (
        <div className="min-h-[400px] border rounded-md p-3 overflow-auto">
          {/* Generate a map of speaker to color for consistent coloring */}
          {(() => {
            // Log structured transcript information
            console.log("TranscriptEditor: Rendering structured view with", transcription.structuredTranscript.segments.length, "segments");
            console.log("TranscriptEditor: Metadata", transcription.structuredTranscript.metadata);
            
            // Extract unique speakers
            const speakers = Array.from(new Set(
              transcription.structuredTranscript.segments
                .filter(segment => segment.speaker)
                .map(segment => segment.speaker)
            ));
            
            console.log("TranscriptEditor: Detected speakers:", speakers.join(", ") || "None");
            
            // Define a set of distinguishable colors for speakers
            const speakerColors = [
              { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
              { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
              { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
              { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
              { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200' },
              { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200' },
              { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' },
              { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-200' },
              { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-200' },
            ];
            
            // Create a map of speaker to color
            const speakerColorMap = new Map();
            speakers.forEach((speaker, index) => {
              const colorIndex = index % speakerColors.length;
              speakerColorMap.set(speaker, speakerColors[colorIndex]);
            });
            
            // Check if we have any speakers
            if (speakers.length === 0 && transcription.structuredTranscript.segments.length > 0) {
              console.warn("TranscriptEditor: No speakers found in structured transcript despite having segments");
            }
            
            return transcription.structuredTranscript.segments.map((segment, index) => {
              let speakerColor = { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
              if (segment.speaker) {
                speakerColor = speakerColorMap.get(segment.speaker) || speakerColor;
              }
              
              return (
                <div key={index} className="mb-4 pb-3 border-b last:border-b-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs font-semibold text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                    </div>
                    {segment.speaker && (
                      <div className={`px-2 py-0.5 ${speakerColor.bg} ${speakerColor.text} text-xs font-semibold rounded-full flex items-center`}>
                        <User className="h-3 w-3 mr-1" />
                        {segment.speaker}
                      </div>
                    )}
                  </div>
                  <div className={`text-sm p-3 rounded border ${segment.speaker ? `${speakerColor.bg} bg-opacity-30 ${speakerColor.border}` : 'border-gray-200'}`}>
                    {segment.text}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <div className="flex space-x-2">
          <Button variant="secondary" onClick={downloadAsTxt}>
            <FileText className="h-4 w-4 mr-2" />
            Export TXT
          </Button>
          
          {/* Enable structured export only if parsedTranscript is valid */}
          {parsedTranscript.isStructured && (
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
    </Card>
  );
}