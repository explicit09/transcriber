import React from 'react';
import { StructuredTranscript, Transcription } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Calendar, Users, FileText } from 'lucide-react';

interface TranscriptViewProps {
  transcription: Transcription;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TranscriptView({ transcription }: TranscriptViewProps) {
  // Parse action items from summary if available
  const actionItems = React.useMemo(() => {
    if (!transcription.actionItems) return [];
    
    // If it's already a string, split by newlines
    if (typeof transcription.actionItems === 'string') {
      return transcription.actionItems.split('\n').filter(Boolean);
    }
    
    // Handle case where it might be an array or other type
    return [];
  }, [transcription.actionItems]);
  
  // If we have structured transcript with segments, render with timestamps
  const hasStructuredTranscript = 
    transcription.structuredTranscript && 
    typeof transcription.structuredTranscript === 'object' && 
    transcription.structuredTranscript.segments &&
    Array.isArray(transcription.structuredTranscript.segments);
  
  const segments = hasStructuredTranscript && transcription.structuredTranscript?.segments 
    ? transcription.structuredTranscript.segments 
    : [];
  
  // If no structured transcript, we'll show plain text
  
  return (
    <div className="space-y-6">
      {/* Meeting Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Summary Card */}
        {transcription.summary && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-primary" />
                Meeting Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-line">{transcription.summary}</p>
            </CardContent>
          </Card>
        )}
        
        {/* Action Items Card */}
        {actionItems.length > 0 && (
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                Key Actionables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {actionItems.map((item, index) => (
                  <li key={index} className="flex items-start">
                    <CheckCircle2 className="h-4 w-4 mr-2 mt-1 text-green-600" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      
      <Separator />
      
      {/* Transcript Content */}
      <ScrollArea className="max-h-[600px] rounded-md border">
        {hasStructuredTranscript ? (
          <div className="space-y-4 p-4">
            {segments.map((segment, index) => (
              <div 
                key={`${segment.start}-${index}`} 
                className="pb-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-start">
                  <span className="text-xs font-mono bg-gray-100 rounded px-1 py-0.5 text-gray-600 mr-2 mt-1">
                    {formatTime(segment.start)}
                  </span>
                  <div className="flex-1">
                    {segment.speaker && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${
                        segment.speaker.includes("1") ? "bg-blue-100 text-blue-800" :
                        segment.speaker.includes("2") ? "bg-green-100 text-green-800" :
                        segment.speaker.includes("3") ? "bg-purple-100 text-purple-800" :
                        segment.speaker.includes("4") ? "bg-amber-100 text-amber-800" :
                        segment.speaker.includes("5") ? "bg-red-100 text-red-800" :
                        "bg-indigo-100 text-indigo-800"
                      }`}>
                        {segment.speaker}
                      </span>
                    )}
                    <p className="text-gray-800">{segment.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <pre className="whitespace-pre-wrap text-gray-800 text-sm">{transcription.text}</pre>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}