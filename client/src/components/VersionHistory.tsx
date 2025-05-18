import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DiffMatchPatch from 'diff-match-patch';
import { Button } from '@/components/ui/button';
import { apiRequest, getQueryFn } from '@/lib/queryClient';

interface RevisionMeta {
  revisionNo: number;
  createdAt: string;
}

interface VersionHistoryProps {
  transcriptId: number;
  currentText: string;
}

export default function VersionHistory({ transcriptId, currentText }: VersionHistoryProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);

  const { data: revisions = [] } = useQuery<RevisionMeta[]>({
    queryKey: [`/api/transcriptions/${transcriptId}/revisions`],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: !!transcriptId,
  });

  const { data: textA } = useQuery({
    queryKey: [`/api/transcriptions/${transcriptId}/revisions`, selected[0]],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/transcriptions/${transcriptId}/revisions/${selected[0]}`);
      return res.text();
    },
    enabled: selected.length >= 1,
  });

  const { data: textB } = useQuery({
    queryKey: [`/api/transcriptions/${transcriptId}/revisions`, selected[1]],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/transcriptions/${transcriptId}/revisions/${selected[1]}`);
      return res.text();
    },
    enabled: selected.length === 2,
  });

  const diffHtml = useMemo(() => {
    const dmp = new DiffMatchPatch();
    if (selected.length === 2 && textA && textB) {
      const diff = dmp.diff_main(textA, textB);
      dmp.diff_cleanupSemantic(diff);
      return dmp.diff_prettyHtml(diff);
    }
    if (selected.length === 1 && textA) {
      const diff = dmp.diff_main(textA, currentText);
      dmp.diff_cleanupSemantic(diff);
      return dmp.diff_prettyHtml(diff);
    }
    return '';
  }, [selected, textA, textB, currentText]);

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!textA) return;
      await apiRequest('PATCH', `/api/transcriptions/${transcriptId}`, { text: textA });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptId}`] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {revisions.map((rev) => {
          const active = selected.includes(rev.revisionNo);
          return (
            <Button
              key={rev.revisionNo}
              variant={active ? 'default' : 'outline'}
              onClick={() =>
                setSelected((prev) => {
                  if (prev.includes(rev.revisionNo)) {
                    return prev.filter((n) => n !== rev.revisionNo);
                  }
                  if (prev.length === 2) return [prev[1], rev.revisionNo];
                  return [...prev, rev.revisionNo];
                })
              }
            >
              {rev.revisionNo}
              <span className="ml-1 text-xs text-gray-500">
                {new Date(rev.createdAt).toLocaleString()}
              </span>
            </Button>
          );
        })}
      </div>
      {diffHtml && (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: diffHtml }} />
      )}
      {selected.length === 1 && (
        <Button onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
          {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
        </Button>
      )}
    </div>
  );
}
