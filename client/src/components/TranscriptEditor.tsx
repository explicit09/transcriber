import { useState } from "react";
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
  File
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface TranscriptEditorProps {
  transcriptionId: number;
  originalText: string;
  fileName: string;
}

export default function TranscriptEditor({ 
  transcriptionId, 
  originalText,
  fileName 
}: TranscriptEditorProps) {
  const [editedText, setEditedText] = useState(originalText);
  const [showDiff, setShowDiff] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  
  // Text analytics
  const wordCount = editedText.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = editedText.length;
  const sentenceCount = editedText.split(/[.!?]+/).filter(Boolean).length;
  
  // Check for filler words
  const fillerWords = ["um", "uh", "like", "you know", "so", "actually", "basically"];
  const fillerWordCounts = fillerWords.reduce((acc, word) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = editedText.match(regex);
    if (matches) {
      acc[word] = matches.length;
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
  
  // Sanitize filename for download
  const sanitizeFileName = (name: string) => {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center space-y-2 sm:space-y-0 mb-2">
        <div className="text-sm text-gray-500 space-x-3">
          <span>{wordCount} words</span>
          <span>{characterCount} characters</span>
          <span>{sentenceCount} sentences</span>
          {totalFillerWords > 0 && (
            <span>{totalFillerWords} filler words</span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch
            id="show-diff"
            checked={showDiff}
            onCheckedChange={setShowDiff}
          />
          <Label htmlFor="show-diff">Show changes</Label>
        </div>
      </div>
      
      <Textarea
        value={editedText}
        onChange={(e) => setEditedText(e.target.value)}
        className="min-h-[400px] font-mono text-sm"
        placeholder="The transcript will appear here. Edit as needed."
      />
      
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