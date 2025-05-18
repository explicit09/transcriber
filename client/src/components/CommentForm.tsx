import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface CommentFormProps {
  transcriptId: number;
}


export default function CommentForm({ transcriptId }: CommentFormProps) {
  const [body, setBody] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueText, setDueText] = useState('');
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/transcriptions/${transcriptId}/comments`, {
        transcriptId,
        yjsPos: {},
        body,
        kind: 'comment',
        status: 'open',
        assignee: assignee || null,
        dueDate: dueText || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptId}/comments`] });
      setBody('');
      setAssignee('');
      setDueText('');
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        createMutation.mutate();
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment"
      />
      <Input
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        placeholder="Assign to"
      />
      <Input
        value={dueText}
        onChange={(e) => setDueText(e.target.value)}
        placeholder="Due date (e.g. tomorrow 5pm)"
      />
      <Button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Adding...' : 'Add Comment'}
      </Button>
    </form>
  );
}
