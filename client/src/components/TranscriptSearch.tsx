import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface SearchResult {
  chunk_id: number;
  speaker: string | null;
  ts_start: number | null;
  ts_end: number | null;
  text: string | null;
  score: number;
}

interface TranscriptSearchProps {
  transcriptId: number;
  onJump: (time: number) => void;
}

export default function TranscriptSearch({ transcriptId, onJump }: TranscriptSearchProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSearch = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const tagParam = selectedTags.length > 0 ? `&tags=${selectedTags.join(',')}` : '';
      const resp = await apiRequest('GET', `/api/search?q=${encodeURIComponent(q)}&transcript_id=${transcriptId}${tagParam}`);
      const data = await resp.json();
      setResults(data as SearchResult[]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search transcript..."
          className="flex-1 border rounded p-2 text-sm"
        />
        <Button onClick={handleSearch} disabled={loading} size="sm">
          Search
        </Button>
      </div>
      <div className="flex gap-4 text-sm">
        {['Decision', 'Risk', 'Date'].map(tag => (
          <label key={tag} className="flex items-center gap-1">
            <Checkbox
              checked={selectedTags.includes(tag)}
              onCheckedChange={() => toggleTag(tag)}
            />
            {tag}
          </label>
        ))}
      </div>
      {results.length > 0 && (
        <ul className="border rounded p-2 max-h-60 overflow-y-auto space-y-1 text-sm bg-white">
          {results.map(r => (
            <li key={r.chunk_id} className="cursor-pointer hover:bg-blue-50 p-1 rounded" onClick={() => r.ts_start !== null && onJump(r.ts_start)}>
              <div className="font-medium">{r.text}</div>
              <div className="text-gray-500 text-xs">
                {r.speaker ? `${r.speaker} · ` : ''}
                {r.ts_start !== null ? r.ts_start.toFixed(2) + 's' : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
