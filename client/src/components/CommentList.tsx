import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { formatTimestamp } from '@/lib/utils';

interface Comment {
  id: number;
  body: string;
  timestamp: number | null;
  speaker?: string | null;
}

interface CommentListProps {
  transcriptId: number;
  onJump?: (time: number) => void;
}

export default function CommentList({ transcriptId, onJump }: CommentListProps) {
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [`/api/transcriptions/${transcriptId}/comments`],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: !!transcriptId,
  });

  if (!comments.length) {
    return <div className="text-sm text-gray-500">No comments</div>;
  }

  return (
    <ul className="space-y-3">
      {comments.map((comment) => (
        <li key={comment.id} className="flex gap-3 text-sm">
          {comment.timestamp !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onJump && onJump(comment.timestamp as number)}
            >
              {formatTimestamp(comment.timestamp as number)}
            </Button>
          )}
          <div>
            {comment.speaker && (
              <div className="text-xs text-gray-500">{comment.speaker}</div>
            )}
            <p>{comment.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
