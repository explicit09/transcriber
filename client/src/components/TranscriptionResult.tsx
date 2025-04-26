import { useState, useMemo } from "react";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TranscriptionResultProps {
  transcriptionText: string;
  fileName: string;
  onNewTranscription: () => void;
}

export default function TranscriptionResult({ 
  transcriptionText, 
  fileName,
  onNewTranscription 
}: TranscriptionResultProps) {
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);

  // Function to process text that appears as a conversation but doesn't have explicit speaker labels
  const processConversationText = (text: string): string[] => {
    // Look for turn-taking indicators specific to academic discussions
    const turnTakingPatterns = [
      // Common acknowledgment phrases that often indicate turn change
      /\b(?:OK\.|Okay\.|OK,|Okay,|Yes\.|Yeah\.|No\.|Right\.|Sure\.|Mm-hmm\.|That's true\.)\s+(?=[A-Z])/g,
      
      // Questions and responses
      /\?\s+(?=[A-Z])/g, // Question marks followed by a new sentence
      
      // Academic conversation patterns
      /\b(?:I think|That's true|I guess|I don't know|I mean|So,|Well,)\b(?=\s+[A-Z])/g,
      
      // Transition words at start of sentences
      /\.\s+(?=(?:But|And|So|Because|However)\b)/g,
      
      // Longer pauses in speech (multiple periods)
      /\.\s\.\s\./g,
      
      // Sentence breaks with speaker transition cues
      /\.\s+(?=[A-Z][^\.]{20,})/g // Period followed by space and capital letter starting a longer sentence
    ];
    
    // First, try to split by paragraphs if they exist
    let segments = text.split(/\n\n+/);
    
    // If no clear paragraphs or too few speakers, split by sentences that likely indicate speaker changes
    if (segments.length < 3) {
      // Start with the full text
      segments = [text];
      
      // Apply each turn-taking pattern to further split segments
      for (const pattern of turnTakingPatterns) {
        const newSegments: string[] = [];
        
        for (const segment of segments) {
          // Skip very short segments or segments that already look like they have a speaker
          if (segment.length < 30 || segment.includes(':')) {
            newSegments.push(segment);
            continue;
          }
          
          // Split by the pattern
          const parts = segment.split(pattern).filter(part => part.trim().length > 0);
          
          if (parts.length > 1) {
            // Simply add all parts to new segments
            for (let i = 0; i < parts.length; i++) {
              // Trim parts to remove any extra whitespace
              newSegments.push(parts[i].trim());
            }
          } else {
            // Otherwise keep the original segment
            newSegments.push(segment);
          }
        }
        
        segments = newSegments;
      }
    }
    
    // Refine segments by merging very short ones and splitting extra long ones
    const refinedSegments: string[] = [];
    for (const segment of segments) {
      if (segment.length < 20 && refinedSegments.length > 0) {
        // Merge very short segments with the previous one
        const lastIndex = refinedSegments.length - 1;
        refinedSegments[lastIndex] = `${refinedSegments[lastIndex]} ${segment}`;
      } else if (segment.length > 500) {
        // Split extra long segments by sentence boundaries
        const sentences = segment.match(/[^.!?]+[.!?]+/g) || [segment];
        
        let currentGroup = '';
        for (const sentence of sentences) {
          if ((currentGroup + sentence).length > 250 && currentGroup.length > 0) {
            refinedSegments.push(currentGroup.trim());
            currentGroup = sentence;
          } else {
            currentGroup += sentence;
          }
        }
        
        if (currentGroup.length > 0) {
          refinedSegments.push(currentGroup.trim());
        }
      } else {
        refinedSegments.push(segment);
      }
    }
    
    // Assign speakers to the segments, using cues from content to guess speaker roles
    let currentSpeaker = 1;
    let lastSpeaker = 0;
    
    return refinedSegments
      .filter(segment => segment.trim().length > 0)
      .map(segment => {
        // Skip segments that already have speaker labels
        if (segment.includes(':')) return segment;
        
        // Try to identify speaker based on content
        if (segment.includes('professor') || segment.includes('instructor') || segment.includes('I would ask')) {
          currentSpeaker = 2; // Professor
        } else if (segment.includes('we are building') || segment.includes('we are trying') || 
                  segment.includes('we discovered') || segment.includes('we are looking')) {
          currentSpeaker = 1; // Student presenting a project
        } else if (segment.length < 50 && 
                  (segment.includes('Yeah') || segment.includes('OK') || segment.includes('That\'s true'))) {
          currentSpeaker = 3; // Brief acknowledgment, likely third speaker
        } else if (lastSpeaker > 0) {
          // If we can't identify by content, alternate speakers but avoid repeating
          do {
            currentSpeaker = currentSpeaker % 3 + 1;
          } while (currentSpeaker === lastSpeaker && segments.length > 3);
        }
        
        lastSpeaker = currentSpeaker;
        return `Speaker ${currentSpeaker}: ${segment.trim()}`;
      });
  };

  // Parse and format the transcript with speaker information
  const formattedTranscript = useMemo(() => {
    // Remove any system messages or metadata about speaker detection at the beginning
    let cleanedText = transcriptionText;
    const systemMessageMatch = transcriptionText.match(/^(?:result:|Speaker Detection:).+?(?:\r?\n|$)/i);
    if (systemMessageMatch) {
      cleanedText = transcriptionText.substring(systemMessageMatch[0].length).trim();
    }
    
    // Check if transcript contains speaker information
    // Look for clear turn-taking patterns, not just "Speaker" keyword
    const hasSpeakerLabels = cleanedText.includes(':') && 
      (cleanedText.includes('Speaker ') || 
       // Detect conversation pattern with multiple short exchanges
       (cleanedText.split('\n').length > 5 && 
        cleanedText.split('\n').filter(line => line.includes(':')).length > 3));
    
    if (!hasSpeakerLabels) {
      // For long text blocks, attempt to split by turn-taking indicators
      if (cleanedText.length > 500) {
        // Break up long text blocks by conversational turns
        const lines = processConversationText(cleanedText);
        
        // Create speaker colors
        const speakerColors = [
          { bg: 'bg-blue-100', text: 'text-blue-800' },
          { bg: 'bg-green-100', text: 'text-green-800' },
          { bg: 'bg-purple-100', text: 'text-purple-800' },
        ];
        
        const speakerColorMap = new Map<string, typeof speakerColors[0]>([
          ['Speaker 1', speakerColors[0]],
          ['Speaker 2', speakerColors[1]],
          ['Speaker 3', speakerColors[2]],
        ]);
        
        return {
          lines,
          hasSpeakerLabels: true,
          speakerColorMap
        };
      }
      
      return { lines: cleanedText.split('\n'), hasSpeakerLabels: false };
    }
    
    // Process the transcript with speaker labels
    const lines = cleanedText.split('\n').filter(line => line.trim() !== '');
    
    // Create a map of speakers to colors for consistent coloring
    const speakers = new Set<string>();
    lines.forEach(line => {
      // More flexible pattern to detect speakers at the beginning of lines
      const speakerMatch = line.match(/^(?:\[\d\d:\d\d\]\s*)?([^:]+):/);
      if (speakerMatch && speakerMatch[1]) {
        speakers.add(speakerMatch[1].trim());
      }
    });
    
    // If we didn't find any clear speakers but the text looks like a conversation,
    // let's try to infer speakers based on paragraph breaks
    if (speakers.size < 2 && lines.length > 5) {
      // Attempt to identify turn-taking in conversation by assigning alternating speakers
      let currentSpeaker = 1;
      const processedLines = lines.map(line => {
        // Skip lines that already have speaker labels
        if (line.includes(':')) return line;
        
        // Otherwise assign a speaker
        currentSpeaker = currentSpeaker === 1 ? 2 : 1;
        return `Speaker ${currentSpeaker}: ${line}`;
      });
      
      // Reprocess with the new speaker labels
      speakers.clear();
      speakers.add('Speaker 1');
      speakers.add('Speaker 2');
      
      return {
        lines: processedLines,
        hasSpeakerLabels: true,
        speakerColorMap: new Map([
          ['Speaker 1', { bg: 'bg-blue-100', text: 'text-blue-800' }],
          ['Speaker 2', { bg: 'bg-green-100', text: 'text-green-800' }]
        ])
      };
    }
    
    // Define speaker colors
    const speakerColors = [
      { bg: 'bg-blue-100', text: 'text-blue-800' },
      { bg: 'bg-green-100', text: 'text-green-800' },
      { bg: 'bg-purple-100', text: 'text-purple-800' },
      { bg: 'bg-amber-100', text: 'text-amber-800' },
      { bg: 'bg-rose-100', text: 'text-rose-800' },
      { bg: 'bg-cyan-100', text: 'text-cyan-800' },
      { bg: 'bg-indigo-100', text: 'text-indigo-800' },
    ];
    
    const speakerColorMap = new Map<string, typeof speakerColors[0]>();
    Array.from(speakers).forEach((speaker, index) => {
      speakerColorMap.set(speaker, speakerColors[index % speakerColors.length]);
    });
    
    return { 
      lines, 
      hasSpeakerLabels: true, 
      speakerColorMap
    };
  }, [transcriptionText]);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(transcriptionText);
      setHasCopied(true);
      toast({
        title: "Copied!",
        description: "Text copied to clipboard.",
        duration: 2000
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setHasCopied(false);
      }, 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy text to clipboard.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadText = () => {
    const filename = `${fileName.split('.')[0]}_transcript.txt`;
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(transcriptionText));
    element.setAttribute('download', filename);
    
    element.style.display = 'none';
    document.body.appendChild(element);
    
    element.click();
    
    document.body.removeChild(element);
  };

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Transcription Result</h3>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyText}
            className={hasCopied ? "bg-green-500 text-white hover:bg-green-600" : ""}
          >
            <Copy className="h-4 w-4 mr-1.5" />
            {hasCopied ? "Copied!" : "Copy"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadText}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
        </div>
      </div>
      
      <div className="bg-gray-50 rounded-md border border-gray-200 p-4 max-h-96 overflow-y-auto">
        {formattedTranscript.hasSpeakerLabels ? (
          <div className="space-y-4">
            {formattedTranscript.lines.map((line, index) => {
              // Match timestamp and speaker
              const timeMatch = line.match(/^\[(\d\d:\d\d)\]/);
              const time = timeMatch ? timeMatch[1] : null;
              
              // Extract speaker and text
              const speakerMatch = line.match(/^(?:\[\d\d:\d\d\]\s+)?([^:]+):(.*)/);
              
              if (speakerMatch) {
                const speaker = speakerMatch[1].trim();
                const text = speakerMatch[2].trim();
                const colorClass = formattedTranscript.speakerColorMap?.get(speaker);
                
                return (
                  <div key={index} className="pb-4 mb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      {time && (
                        <span className="text-xs font-mono text-gray-500">{time}</span>
                      )}
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass?.bg || 'bg-gray-100'} ${colorClass?.text || 'text-gray-800'}`}>
                        {speaker}
                      </span>
                    </div>
                    <p className="ml-6 text-gray-800 whitespace-pre-line">{text}</p>
                  </div>
                );
              }
              
              // Just a regular line without speaker information
              return (
                <p key={index} className="text-gray-700">
                  {line}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-700 whitespace-pre-line">
            {transcriptionText}
          </p>
        )}
      </div>
      
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          onClick={onNewTranscription}
        >
          Transcribe another file
        </Button>
      </div>
    </div>
  );
}