import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Check, X } from "lucide-react";

interface SpeakerManagerProps {
  transcriptionId: number;
  transcriptionText: string;
  onTranscriptionUpdated: () => void;
}

export default function SpeakerManager({ 
  transcriptionId,
  transcriptionText,
  onTranscriptionUpdated
}: SpeakerManagerProps) {
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Extract speakers from the transcription text
    const extractSpeakers = () => {
      const extractedSpeakers = new Set<string>();
      // Updated regex to match both formats:
      // 1. "Speaker X:" at the beginning of a line
      // 2. "[00:00] Speaker X:" format
      const speakerRegex = /(?:^\[[\d:]+\]\s*)?(Speaker \d+):|^(Speaker \d+):/gm;
      let match;
      
      // Use regex to find all speaker labels
      while ((match = speakerRegex.exec(transcriptionText)) !== null) {
        extractedSpeakers.add(match[1] || match[2]);
      }
      
      const speakerArray = Array.from(extractedSpeakers);
      setSpeakers(speakerArray);
      
      // Initialize with original names
      const initialNames: Record<string, string> = {};
      speakerArray.forEach(speaker => {
        initialNames[speaker] = speaker;
      });
      setSpeakerNames(initialNames);
    };
    
    if (transcriptionText) {
      extractSpeakers();
    }
  }, [transcriptionText]);

  const handleNameChange = (speaker: string, newName: string) => {
    setSpeakerNames(prev => ({
      ...prev,
      [speaker]: newName
    }));
  };

  const handleSave = async () => {
    // Check if any names were changed
    const hasChanges = Object.entries(speakerNames).some(([original, custom]) => original !== custom);
    
    if (!hasChanges) {
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Replace all speaker occurrences in the text
      let updatedText = transcriptionText;
      Object.entries(speakerNames).forEach(([original, custom]) => {
        if (original !== custom) {
          // Use two regexes to handle both formats:
          // 1. When the speaker is at the beginning of a line: "Speaker X:"
          // 2. When the speaker follows a timestamp: "[00:00] Speaker X:"
          const timestampRegex = new RegExp(`(\\[\\d+:\\d+\\]\\s*)${original}:`, "g");
          const plainRegex = new RegExp(`^${original}:`, "gm");
          
          updatedText = updatedText
            .replace(timestampRegex, `$1${custom}:`)
            .replace(plainRegex, `${custom}:`);
        }
      });
      
      // Send the updated text to the server
      const response = await apiRequest("PATCH", `/api/transcriptions/${transcriptionId}`, {
        text: updatedText
      });
      
      if (response.ok) {
        toast({
          title: "Speakers renamed",
          description: "Speaker names have been updated successfully.",
          duration: 3000
        });
        onTranscriptionUpdated();
      } else {
        throw new Error("Failed to update transcription");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update speaker names.",
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    // Reset to original speaker names
    const originalNames: Record<string, string> = {};
    speakers.forEach(speaker => {
      originalNames[speaker] = speaker;
    });
    setSpeakerNames(originalNames);
    setIsEditing(false);
  };

  if (speakers.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Speakers</h3>
        {!isEditing ? (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsEditing(true)}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Rename Speakers
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCancel}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                <span className="flex items-center">
                  <Check className="h-4 w-4 mr-2" />
                  Save
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {speakers.map(speaker => (
          <div key={speaker} className="flex items-center">
            <div className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium mr-2">
              {speaker}
            </div>
            {isEditing ? (
              <Input
                value={speakerNames[speaker]}
                onChange={(e) => handleNameChange(speaker, e.target.value)}
                placeholder="Enter name"
                className="h-8 text-sm"
              />
            ) : (
              <span className="text-sm text-gray-700">
                {speakerNames[speaker] !== speaker ? speakerNames[speaker] : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 