import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Users, UserX, UserCheck, RefreshCw } from 'lucide-react';

interface SpeakerSimilarityProps {
  transcriptionId: number;
  onMergeSpeakers: (targetCount: number) => Promise<void>;
}

interface SpeakerStats {
  totalWords: number;
  averageWordsPerSegment: number;
  segmentCount: number;
  totalDuration: number;
  averageDuration: number;
  topWords: { word: string; count: number }[];
}

interface SpeakerPair {
  speaker1: string;
  speaker2: string;
  similarity: number;
  vocabularySimilarity: number;
  durationSimilarity: number;
  wordsSimilarity: number;
}

export default function SpeakerSimilarity({ transcriptionId, onMergeSpeakers }: SpeakerSimilarityProps) {
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [speakerStats, setSpeakerStats] = useState<Record<string, SpeakerStats>>({});
  const [speakerPairs, setSpeakerPairs] = useState<SpeakerPair[]>([]);
  const [currentSpeakerCount, setCurrentSpeakerCount] = useState(0);
  const [targetSpeakerCount, setTargetSpeakerCount] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const { toast } = useToast();

  // Fetch speaker similarity data
  const fetchSpeakerSimilarity = async () => {
    if (!transcriptionId) return;
    
    setIsLoading(true);
    try {
      const response = await apiRequest("GET", `/api/transcriptions/${transcriptionId}/speaker-similarity`);
      const data = await response.json();
      
      console.log('Speaker similarity data:', data);
      
      setSpeakers(data.speakers || []);
      setSpeakerStats(data.speakerStats || {});
      setSpeakerPairs(data.speakerPairs || []);
      setCurrentSpeakerCount(data.currentSpeakerCount || 0);
      
      // Only set target speaker count if we have more than one speaker
      if (data.currentSpeakerCount > 1) {
        setTargetSpeakerCount(Math.max(2, Math.min(Math.floor(data.currentSpeakerCount / 2), data.currentSpeakerCount - 1)));
      }
    } catch (error) {
      console.error('Error fetching speaker similarity:', error);
      toast({
        title: 'Error',
        description: 'Failed to analyze speaker similarity',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle merging speakers
  const handleMergeSpeakers = async () => {
    if (!transcriptionId || targetSpeakerCount >= currentSpeakerCount) return;
    
    setIsMerging(true);
    try {
      await onMergeSpeakers(targetSpeakerCount);
      toast({
        title: 'Success',
        description: `Merged speakers down to ${targetSpeakerCount}`,
      });
      // Refresh similarity data after merging
      await fetchSpeakerSimilarity();
    } catch (error) {
      console.error('Error merging speakers:', error);
      toast({
        title: 'Error',
        description: 'Failed to merge speakers',
        variant: 'destructive'
      });
    } finally {
      setIsMerging(false);
    }
  };

  // Init fetch
  useEffect(() => {
    fetchSpeakerSimilarity();
  }, [transcriptionId]);

  // If we have no speakers or just one, show a message
  if (currentSpeakerCount <= 1 && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Speaker Analysis</CardTitle>
          <CardDescription>Not enough speakers to analyze</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
            <UserX className="h-16 w-16 mb-2" />
            <p>This transcript has {currentSpeakerCount || 'no'} speaker(s), so there's nothing to analyze or merge.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Speaker Similarity Analysis</CardTitle>
            <CardDescription>
              {isLoading 
                ? 'Analyzing speaker patterns...' 
                : `Analyzing ${currentSpeakerCount} speakers for potential merging`}
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={fetchSpeakerSimilarity} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Users className="h-12 w-12 mb-4 animate-pulse" />
            <Progress value={30} className="w-[80%] mb-2" />
            <p className="text-muted-foreground">Analyzing speaker patterns...</p>
          </div>
        ) : (
          <>
            {speakerPairs.length > 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Most Similar Speaker Pairs</h3>
                  <div className="space-y-3">
                    {speakerPairs.slice(0, 5).map((pair, index) => (
                      <div key={index} className="bg-accent/50 p-3 rounded-md">
                        <div className="flex justify-between mb-1">
                          <div className="flex space-x-2">
                            <Badge variant="secondary">{pair.speaker1}</Badge>
                            <Badge variant="secondary">{pair.speaker2}</Badge>
                          </div>
                          <Badge variant={pair.similarity > 0.6 ? 'destructive' : 'outline'}>
                            {Math.round(pair.similarity * 100)}% similar
                          </Badge>
                        </div>
                        <Progress value={pair.similarity * 100} className="h-2 mb-2" />
                        <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                          <div>Vocabulary: {Math.round(pair.vocabularySimilarity * 100)}%</div>
                          <div>Duration: {Math.round(pair.durationSimilarity * 100)}%</div>
                          <div>Words/segment: {Math.round(pair.wordsSimilarity * 100)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 space-y-2 pt-4 border-t">
                  <div className="flex justify-between">
                    <h3 className="text-sm font-medium">Target Speaker Count</h3>
                    <Badge variant="outline">{targetSpeakerCount} speakers</Badge>
                  </div>
                  <div className="py-4">
                    <Slider
                      value={[targetSpeakerCount]}
                      min={1}
                      max={currentSpeakerCount - 1}
                      step={1}
                      onValueChange={(value) => setTargetSpeakerCount(value[0])}
                      disabled={isMerging}
                    />
                  </div>
                  <div className="flex text-xs justify-between text-muted-foreground mb-4">
                    <span>1 speaker</span>
                    <span>{currentSpeakerCount - 1} speakers</span>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleMergeSpeakers} 
                    disabled={isMerging || targetSpeakerCount >= currentSpeakerCount}
                  >
                    {isMerging ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Merging Speakers...
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-4 w-4" />
                        Merge to {targetSpeakerCount} speaker{targetSpeakerCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {speakers.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-medium mb-2">Speaker Stats</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {speakers.map(speaker => (
                    <div key={speaker} className="bg-accent/50 p-3 rounded-md">
                      <div className="flex justify-between mb-2">
                        <Badge variant="secondary">{speaker}</Badge>
                        <div className="text-xs text-muted-foreground">
                          {speakerStats[speaker]?.segmentCount} segments
                        </div>
                      </div>
                      {speakerStats[speaker]?.topWords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {speakerStats[speaker].topWords.slice(0, 5).map((word, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {word.word} ({word.count})
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
} 