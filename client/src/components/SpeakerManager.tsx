import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Users, UserCheck, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SpeakerManagerProps {
  transcriptionId: number;
  structuredTranscript?: any;
  onSpeakersUpdated: () => void;
}

export default function SpeakerManager({ 
  transcriptionId,
  structuredTranscript,
  onSpeakersUpdated
}: SpeakerManagerProps) {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAutoMerging, setIsAutoMerging] = useState(false);
  const [targetSpeakerCount, setTargetSpeakerCount] = useState<string>("2");
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({});
  const [showHelp, setShowHelp] = useState(false);
  
  // Get unique speakers from the transcript
  useEffect(() => {
    if (structuredTranscript?.segments) {
      const uniqueSpeakers = Array.from(
        new Set(
          structuredTranscript.segments
            .map((seg: any) => seg.speaker)
            .filter(Boolean)
        )
      );
      setSpeakers(uniqueSpeakers as string[]);
      
      // Initialize mappings to the current values
      const initialMappings: Record<string, string> = {};
      uniqueSpeakers.forEach((speaker: string) => {
        initialMappings[speaker] = speaker;
      });
      setSpeakerMappings(initialMappings);
    }
  }, [structuredTranscript]);
  
  // Handle speaker mapping change
  const handleSpeakerChange = (originalSpeaker: string, newSpeaker: string) => {
    setSpeakerMappings(prev => ({
      ...prev,
      [originalSpeaker]: newSpeaker
    }));
  };
  
  // Merge all similar speakers into main speakers
  const handleMergeOverSegmented = () => {
    // Find all detected speaker numbers
    const speakerNumbers: Record<number, string[]> = {};
    
    speakers.forEach(speaker => {
      const match = speaker.match(/Speaker\s+(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!speakerNumbers[num]) {
          speakerNumbers[num] = [];
        }
        speakerNumbers[num].push(speaker);
      }
    });
    
    // Create mappings
    const newMappings = { ...speakerMappings };
    
    // Map all variants to the main speaker label
    Object.entries(speakerNumbers).forEach(([num, speakerVariants]) => {
      if (speakerVariants.length > 1) {
        const mainSpeaker = `Speaker ${num}`;
        speakerVariants.forEach(variant => {
          if (variant !== mainSpeaker) {
            newMappings[variant] = mainSpeaker;
          }
        });
      }
    });
    
    setSpeakerMappings(newMappings);
  };
  
  // Auto-merge speakers using AI
  const handleAutoMergeSpeakers = async () => {
    const targetCount = parseInt(targetSpeakerCount, 10);
    
    if (isNaN(targetCount) || targetCount <= 0 || targetCount >= speakers.length) {
      toast({
        title: "Invalid speaker count",
        description: `Please enter a number between 1 and ${speakers.length - 1}.`,
        variant: "destructive"
      });
      return;
    }
    
    setIsAutoMerging(true);
    
    try {
      const response = await apiRequest(
        "POST", 
        `/api/transcriptions/${transcriptionId}/merge-speakers`,
        { targetSpeakerCount: targetCount }
      );
      
      if (response.ok) {
        toast({
          title: "Speakers merged",
          description: `Successfully merged speakers to ${targetCount} speakers.`,
          variant: "default"
        });
        onSpeakersUpdated();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to merge speakers");
      }
    } catch (error) {
      toast({
        title: "Merge failed",
        description: error instanceof Error ? error.message : "Failed to merge speakers",
        variant: "destructive"
      });
    } finally {
      setIsAutoMerging(false);
    }
  };
  
  // Apply speaker mappings
  const handleApplyMappings = async () => {
    // Check if any mappings have actually changed
    let hasChanges = false;
    for (const [original, mapped] of Object.entries(speakerMappings)) {
      if (original !== mapped) {
        hasChanges = true;
        break;
      }
    }
    
    if (!hasChanges) {
      toast({
        title: "No changes",
        description: "No speaker mappings have been changed.",
        variant: "default"
      });
      return;
    }
    
    setIsUpdating(true);
    
    try {
      const response = await apiRequest(
        "PATCH", 
        `/api/transcriptions/${transcriptionId}/speakers`,
        { speakerMappings }
      );
      
      if (response.ok) {
        toast({
          title: "Speakers updated",
          description: "Speaker labels have been successfully updated.",
          variant: "default"
        });
        onSpeakersUpdated();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to update speakers");
      }
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update speakers",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const speakerCount = speakers.length;
  
  if (speakerCount <= 1) {
    return null; // No need to show this component if there's only one speaker
  }

  return (
    <div className="mt-6 p-4 border border-gray-200 rounded-md bg-gray-50">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center">
          <Users className="h-5 w-5 mr-2 text-gray-700" />
          <h3 className="text-lg font-medium">Speaker Management</h3>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowHelp(!showHelp)}
        >
          <AlertCircle className="h-4 w-4 mr-1" />
          {showHelp ? "Hide help" : "Help"}
        </Button>
      </div>
      
      {showHelp && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          <p><strong>Is the system detecting too many speakers?</strong></p>
          <p className="mt-1">If the same person is incorrectly detected as multiple speakers, you can merge them:</p>
          <ul className="list-disc list-inside mt-1 ml-4">
            <li>Use the dropdowns to map incorrectly split speakers to the correct speaker</li>
            <li>Click "Auto-Fix Over-Segmentation" for automatic merging of similar speakers</li>
            <li>Click "Apply Changes" when you're done</li>
          </ul>
        </div>
      )}
      
      {speakerCount > 3 && (
        <div className="flex items-center mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleMergeOverSegmented}
            className="mr-2"
          >
            <UserCheck className="h-4 w-4 mr-1" />
            Auto-Fix Over-Segmentation
          </Button>
          <p className="text-xs text-gray-500">
            Detected {speakerCount} speakers - click to merge if over-separated
          </p>
        </div>
      )}
      
      {speakerCount > 2 && (
        <div className="flex items-center mt-4 mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="flex-1">
            <h4 className="font-medium text-sm">Auto-Merge with AI</h4>
            <p className="text-xs text-gray-600 mt-1">
              Uses AI to automatically merge similar speakers down to your target count.
            </p>
          </div>
          <div className="flex items-center">
            <Select
              value={targetSpeakerCount}
              onValueChange={setTargetSpeakerCount}
            >
              <SelectTrigger className="w-20 mr-2">
                <SelectValue placeholder="Count" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({length: speakers.length - 1}, (_, i) => (
                  <SelectItem key={i+1} value={(i+1).toString()}>
                    {i+1}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleAutoMergeSpeakers}
              disabled={isAutoMerging}
            >
              {isAutoMerging ? "Merging..." : "Auto-Merge"}
            </Button>
          </div>
        </div>
      )}
    
      <div className="space-y-2 mt-4">
        {speakers.map(speaker => (
          <div key={speaker} className="flex items-center space-x-2">
            <Label htmlFor={`speaker-${speaker}`} className="w-32 flex-shrink-0">
              {speaker}:
            </Label>
            <Select
              value={speakerMappings[speaker] || speaker}
              onValueChange={(value) => handleSpeakerChange(speaker, value)}
            >
              <SelectTrigger 
                id={`speaker-${speaker}`}
                className="flex-1"
              >
                <SelectValue placeholder="Select speaker" />
              </SelectTrigger>
              <SelectContent>
                {speakers.map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      
      <div className="mt-4 flex justify-end">
        <Button 
          onClick={handleApplyMappings}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating..." : "Apply Changes"}
        </Button>
      </div>
    </div>
  );
} 