import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Mic, Square, Save, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AudioRecorderProps {
  onRecordingComplete: (file: File) => void;
  maxDuration?: number; // in seconds
}

export default function AudioRecorder({ 
  onRecordingComplete, 
  maxDuration = 300 // 5 minutes default
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  
  // Clean up audio URL when component unmounts
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);
  
  // Start recording
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create a new MediaRecorder instance
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Create a blob from the recorded chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        
        // Create a URL for the blob
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Start recording
      mediaRecorder.start(10); // Collect data every 10ms
      setIsRecording(true);
      
      // Start a timer to update the UI
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          // If we hit the max duration, stop recording
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
      toast({
        title: "Recording started",
        description: "Your microphone is now recording audio.",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use this feature.",
        variant: "destructive",
      });
    }
  };
  
  // Stop recording
  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }
    
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  // Save the recorded audio and pass it to the parent component
  const saveRecording = () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    
    try {
      // Create a File object from the Blob
      const now = new Date();
      const fileName = `recording_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.webm`;
      
      // Convert to MP3 or WAV if needed (not implemented here - would require additional libraries)
      const file = new File([audioBlob], fileName, { type: audioBlob.type });
      
      // Pass the file up to the parent component
      onRecordingComplete(file);
      
      toast({
        title: "Recording saved",
        description: "Your recording is ready to be transcribed.",
      });
    } catch (error) {
      console.error('Error saving recording:', error);
      toast({
        title: "Failed to save recording",
        description: "There was an error saving your recording.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      
      // Reset the recorder state
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  };
  
  // Cancel the recording
  const cancelRecording = () => {
    if (isRecording) {
      stopRecording();
    }
    
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setRecordingTime(0);
    
    toast({
      title: "Recording discarded",
      description: "The recording has been deleted.",
    });
  };
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Calculate progress percentage
  const progressPercentage = (recordingTime / maxDuration) * 100;
  
  return (
    <div className="border rounded-md p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Record Audio</h3>
        <div className="text-sm text-gray-500">
          {formatTime(recordingTime)} / {formatTime(maxDuration)}
        </div>
      </div>
      
      <Progress value={progressPercentage} className="h-2" />
      
      <div className="flex justify-center py-4">
        {isRecording ? (
          <Button 
            onClick={stopRecording}
            size="lg"
            variant="destructive"
            className="rounded-full w-16 h-16 p-0 flex items-center justify-center"
          >
            <Square className="h-6 w-6" />
          </Button>
        ) : (
          <Button 
            onClick={startRecording}
            size="lg"
            variant="default"
            className="rounded-full w-16 h-16 p-0 flex items-center justify-center bg-red-600 hover:bg-red-700"
            disabled={!!audioBlob || isProcessing}
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}
      </div>
      
      {audioUrl && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <audio src={audioUrl} controls className="w-full max-w-md" />
          </div>
          
          <div className="flex justify-center gap-2">
            <Button 
              onClick={saveRecording} 
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Use Recording
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={cancelRecording}
              disabled={isProcessing}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Discard
            </Button>
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-500 text-center">
        Recordings are limited to {Math.floor(maxDuration / 60)} minutes and will be saved in WebM format.
      </div>
    </div>
  );
}