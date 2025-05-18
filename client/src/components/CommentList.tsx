import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getQueryFn, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { formatTimestamp } from '@/lib/utils';


interface Comment {
  id: number;
  body: string;
  timestamp: number | null;
  speaker?: string | null;
  assignee?: string | null;
  status?: string;
  dueDate?: string | null;
}

interface CommentListProps {
  transcriptId: number;
  onJump?: (time: number) => void;
}

export default function CommentList({ transcriptId, onJump }: CommentListProps) {
  const qc = useQueryClient();
  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [`/api/transcriptions/${transcriptId}/comments`],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: !!transcriptId,
  });

  const resolveMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest('PATCH', `/api/transcriptions/${transcriptId}/comments/${commentId}`, {
        status: 'resolved',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptId}/comments`] });
    },
  });

  const updateComment = async (
    commentId: number,
    body: string,
    assignee: string,
    dueText: string
  ) => {
    await apiRequest('PATCH', `/api/transcriptions/${transcriptId}/comments/${commentId}`, {
      body,
      assignee: assignee || null,
      dueDate: dueText || null,
    });
  };

  function CommentItem({ comment }: { comment: Comment }) {
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(comment.body);
    const [assignee, setAssignee] = useState(comment.assignee || '');
    const [dueText, setDueText] = useState(comment.dueDate ? comment.dueDate : '');

    const saveMutation = useMutation({
      mutationFn: async () => {
        await updateComment(comment.id, body, assignee, dueText);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptId}/comments`] });
        setEditing(false);
      },
    });

    return (
      <li className="flex gap-3 text-sm">
        {comment.timestamp !== null && (
          <Button variant="outline" size="sm" onClick={() => onJump && onJump(comment.timestamp as number)}>
            {formatTimestamp(comment.timestamp as number)}
          </Button>
        )}
        <div className="flex-1 space-y-1">
          {comment.speaker && <div className="text-xs text-gray-500">{comment.speaker}</div>}
          {editing ? (
            <>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
              <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assign to" />
              <Input value={dueText} onChange={(e) => setDueText(e.target.value)} placeholder="Due date" />
              <div className="flex gap-2 mt-1">
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  Save
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>{comment.body}</p>
              {comment.assignee && <div className="text-xs text-gray-500">Assigned to {comment.assignee}</div>}
              {comment.dueDate && <div className="text-xs text-gray-500">Due {comment.dueDate}</div>}
              <div className="flex gap-2 mt-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {comment.status !== 'resolved' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolveMutation.mutate(comment.id)}
                    disabled={resolveMutation.isPending}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </li>
    );
  }

  if (!comments.length) {
    return <div className="text-sm text-gray-500">No comments</div>;
  }

  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} />
      ))}
    </ul>
  );
}
