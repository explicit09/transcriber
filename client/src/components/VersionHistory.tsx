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
  const [selected, setSelected] = useState<number | null>(null);

  const { data: revisions = [] } = useQuery<RevisionMeta[]>({
    queryKey: [`/api/transcriptions/${transcriptId}/revisions`],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: !!transcriptId,
  });

  const { data: revisionText } = useQuery({
    queryKey: [`/api/transcriptions/${transcriptId}/revisions`, selected],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/transcriptions/${transcriptId}/revisions/${selected}`);
      return res.text();
    },
    enabled: selected !== null,
  });

  const diffHtml = useMemo(() => {
    if (revisionText && currentText) {
      const dmp = new DiffMatchPatch();
      const diff = dmp.diff_main(revisionText, currentText);
      dmp.diff_cleanupSemantic(diff);
      return dmp.diff_prettyHtml(diff);
    }
    return '';
  }, [revisionText, currentText]);

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (revisionText == null) return;
      await apiRequest('PATCH', `/api/transcriptions/${transcriptId}`, { text: revisionText });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptId}`] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {revisions.map((rev) => (
          <Button
            key={rev.revisionNo}
            variant={rev.revisionNo === selected ? 'default' : 'outline'}
            onClick={() => setSelected(rev.revisionNo)}
          >
            {rev.revisionNo}
            <span className="ml-1 text-xs text-gray-500">
              {new Date(rev.createdAt).toLocaleString()}
            </span>
          </Button>
        ))}
      </div>
      {diffHtml && (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: diffHtml }} />
      )}
      {selected !== null && (
        <Button onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
          {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
        </Button>
      )}
    </div>
  );
}
