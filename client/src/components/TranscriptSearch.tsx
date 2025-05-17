import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

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
  onJump: (time: number, text: string) => void;
}

export default function TranscriptSearch({
  transcriptId,
  onJump,
}: TranscriptSearchProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const resp = await apiRequest(
        "GET",
        `/api/search?q=${encodeURIComponent(q)}&transcript_id=${transcriptId}`,
      );
      const data = await resp.json();
      setResults(data as SearchResult[]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transcript..."
          className="flex-1 border rounded p-2 text-sm"
        />
        <Button onClick={handleSearch} disabled={loading} size="sm">
          Search
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="border rounded p-2 max-h-60 overflow-y-auto space-y-1 text-sm bg-white">
          {results.map((r) => (
            <li
              key={r.chunk_id}
              className="cursor-pointer hover:bg-blue-50 p-1 rounded"
              onClick={() =>
                r.ts_start !== null && onJump(r.ts_start, r.text ?? "")
              }
            >
              <div className="font-medium">{r.text}</div>
              <div className="text-gray-500 text-xs">
                {r.speaker ? `${r.speaker} · ` : ""}
                {r.ts_start !== null ? r.ts_start.toFixed(2) + "s" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
