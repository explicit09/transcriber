import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface MeetingMetadata {
  meetingTitle: string;
  meetingDate: Date;
  participants: string;
  // Advanced options
  enableSpeakerLabels: boolean;
  enableTimestamps: boolean;
  language: string | null;
  generateSummary: boolean;
}

interface MeetingMetadataFormProps {
  onSubmit: (metadata: MeetingMetadata) => void;
  isUploading: boolean;
  defaultValues?: Partial<MeetingMetadata>;
}

export default function MeetingMetadataForm({ 
  onSubmit, 
  isUploading,
  defaultValues = {}
}: MeetingMetadataFormProps) {
  // Default to current date if not provided
  const [meetingDate, setMeetingDate] = useState<Date>(
    defaultValues.meetingDate || new Date()
  );
  const [meetingTitle, setMeetingTitle] = useState<string>(
    defaultValues.meetingTitle || ""
  );
  const [participants, setParticipants] = useState<string>(
    defaultValues.participants || ""
  );
  
  // Advanced options 
  const [enableSpeakerLabels, setEnableSpeakerLabels] = useState<boolean>(
    defaultValues.enableSpeakerLabels || true
  );
  const [enableTimestamps, setEnableTimestamps] = useState<boolean>(
    defaultValues.enableTimestamps || false
  );
  const [language, setLanguage] = useState<string | null>(
    defaultValues.language || null
  );
  const [generateSummary, setGenerateSummary] = useState<boolean>(
    defaultValues.generateSummary || false
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      meetingTitle,
      meetingDate,
      participants,
      enableSpeakerLabels,
      enableTimestamps,
      language,
      generateSummary
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="meeting-title">Meeting Title</Label>
        <Input
          id="meeting-title"
          placeholder="Weekly Team Sync"
          value={meetingTitle}
          onChange={(e) => setMeetingTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="meeting-date">Meeting Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
              type="button"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {meetingDate ? format(meetingDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={meetingDate}
              onSelect={(date) => date && setMeetingDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="participants">Participants</Label>
        <Textarea
          id="participants"
          placeholder="John Doe, Jane Smith, etc."
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          className="min-h-[80px]"
        />
      </div>
      
      <Accordion type="single" collapsible className="w-full" defaultValue="advanced-options">
        <AccordionItem value="advanced-options">
          <AccordionTrigger className="text-sm">Transcription Features <span className="text-green-600 ml-2 font-medium text-xs">Speaker ID enabled</span></AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="speaker-labels" className="block mb-1 font-semibold">
                    Speaker Identification <span className="text-green-600 text-xs font-medium ml-1">Recommended</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically identify and label different speakers in the transcript
                  </p>
                </div>
                <Switch 
                  id="speaker-labels" 
                  checked={enableSpeakerLabels}
                  onCheckedChange={setEnableSpeakerLabels}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="timestamps" className="block mb-1">Timestamps</Label>
                  <p className="text-xs text-muted-foreground">
                    Add time markers to the transcript
                  </p>
                </div>
                <Switch 
                  id="timestamps" 
                  checked={enableTimestamps}
                  onCheckedChange={setEnableTimestamps}
                />
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="language" className="block">Language (optional)</Label>
                <Select 
                  value={language || "auto"} 
                  onValueChange={(value) => setLanguage(value === "auto" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-detect language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="generate-summary" className="block mb-1">Generate Summary</Label>
                  <p className="text-xs text-muted-foreground">
                    Create an AI summary of the transcript
                  </p>
                </div>
                <Switch 
                  id="generate-summary" 
                  checked={generateSummary}
                  onCheckedChange={setGenerateSummary}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button 
        type="submit" 
        className="w-full mt-4" 
        disabled={isUploading || !meetingTitle}
      >
        {isUploading ? "Uploading..." : "Continue"}
      </Button>
    </form>
  );
}