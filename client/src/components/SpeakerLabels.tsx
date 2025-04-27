import React, { useState } from 'react';
import { TranscriptSegment } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Edit, Save, User, UserCheck } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getSpeakerColorClass } from '@/lib/utils';

interface SpeakerLabelsProps {
  segments: TranscriptSegment[];
  transcriptionId?: number;
  onSpeakersUpdated?: () => void;
  readOnly?: boolean;
}

export default function SpeakerLabels({ 
  segments, 
  transcriptionId, 
  onSpeakersUpdated,
  readOnly = false
}: SpeakerLabelsProps) {
  const { toast } = useToast();
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Get unique speakers
  const speakers = Array.from(new Set(
    segments
      .filter(segment => segment.speaker)
      .map(segment => segment.speaker)
  ));
  
  // State for edited speaker names
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(() => {
    const names: Record<string, string> = {};
    speakers.forEach(speaker => {
      if (speaker) {
        names[speaker] = speaker;
      }
    });
    return names;
  });

  // If no speakers, don't render anything
  if (speakers.length === 0) {
    return null;
  }
  
  const handleSaveSpeakerNames = async () => {
    if (!transcriptionId) {
      toast({
        title: "Cannot save speaker names",
        description: "Transcription ID is missing",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Create mapping from original speaker names to new names
      const speakerMappings: Record<string, string> = {};
      Object.entries(speakerNames).forEach(([original, newName]) => {
        // Only include if the name actually changed
        if (original !== newName && newName.trim() !== '') {
          speakerMappings[original] = newName.trim();
        }
      });
      
      if (Object.keys(speakerMappings).length === 0) {
        toast({
          title: "No changes made",
          description: "Speaker names were not changed"
        });
        setIsEditingOpen(false);
        return;
      }
      
      // Call the API to update speaker names
      const response = await apiRequest(
        'PATCH', 
        `/api/transcriptions/${transcriptionId}/speakers`,
        { speakerMappings }
      );
      
      if (response.ok) {
        toast({
          title: "Speaker names updated",
          description: "The transcript has been updated with the new speaker names"
        });
        
        // Trigger refresh
        if (onSpeakersUpdated) {
          onSpeakersUpdated();
        }
        
        setIsEditingOpen(false);
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update speaker names");
      }
    } catch (error) {
      console.error("Error updating speaker names:", error);
      toast({
        title: "Failed to update speaker names",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 bg-gray-50 p-3 rounded-md border">
      <span className="text-sm text-gray-500 font-medium mr-2">Speakers:</span>
      {speakers.map((speaker, index) => (
        <span 
          key={speaker} 
          className={`px-3 py-1 rounded-full text-sm font-medium ${getSpeakerColorClass(speaker)}`}
        >
          {speakerNames[speaker as string] || speaker}
        </span>
      ))}
      
      {!readOnly && transcriptionId && (
        <Dialog open={isEditingOpen} onOpenChange={setIsEditingOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto h-7">
              <Edit className="h-3.5 w-3.5 mr-1" />
              Edit Names
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Speaker Names</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Customize the speaker names to make your transcript more meaningful.
              </p>
              {speakers.map((speaker) => (
                <div key={speaker} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getSpeakerColorClass(speaker)}`}>
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <Input 
                      value={speakerNames[speaker as string] || speaker} 
                      onChange={(e) => {
                        setSpeakerNames({
                          ...speakerNames,
                          [speaker as string]: e.target.value
                        });
                      }}
                      placeholder="Enter speaker name"
                    />
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsEditingOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={handleSaveSpeakerNames} 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Names
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      <span className="text-xs text-gray-500 ml-auto self-end">
        {speakers.length} speaker{speakers.length !== 1 ? 's' : ''} detected
      </span>
    </div>
  );
}