import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
    defaultValues.enableSpeakerLabels || false
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

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isUploading || !meetingTitle}
      >
        {isUploading ? "Uploading..." : "Continue"}
      </Button>
    </form>
  );
}