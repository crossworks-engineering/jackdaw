'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CommentThread } from '@mantle/web-ui/comment-thread';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { useRealtime } from '@/components/realtime/use-realtime';
import type { NodeComment } from '@mantle/client-types';

/** Role chip text per author kind — the forum's vocabulary, owner's side. */
const ROLE_CHIP: Record<NodeComment['authorKind'], string | null> = {
  owner: null, // a login's name speaks for itself
  member: 'Team',
  agent: 'Assistant',
};

/**
 * The discussion thread on a task, owner side. `<CommentThread>` owns the
 * anatomy and the composer; this owns the transport — the query, the writes,
 * and a realtime subscription scoped to this node so a member/agent comment
 * appears live.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const commentsQuery = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () =>
      apiFetch<{ comments: NodeComment[] }>(`/api/nodes/${taskId}/comments`).then(
        (r) => r.comments,
      ),
  });

  // Thread-scoped invalidation only. The task-row counts repaint via the
  // parent's debounced ['task','comment'] subscription — invalidating the
  // whole ['tasks'] tree from here refetched a 500-row board per comment.
  useRealtime(['comment'], (c) => {
    if (c.id && c.id !== taskId) return;
    void queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });

  const send = async (body: string) => {
    try {
      await apiSend(`/api/nodes/${taskId}/comments`, 'POST', { body });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not add comment');
      }
      return false; // keep the draft — a failed send must not lose the text
    }
    refresh();
    return true;
  };

  const remove = async (id: string) => {
    try {
      await apiSend(`/api/comments/${id}`, 'DELETE');
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not delete comment');
      }
      return;
    }
    refresh();
  };

  return (
    <CommentThread
      comments={commentsQuery.data ?? []}
      pending={commentsQuery.isPending}
      roleChip={ROLE_CHIP}
      onSend={send}
      onDelete={(id) => void remove(id)}
    />
  );
}
