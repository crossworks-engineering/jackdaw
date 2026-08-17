'use client';

/**
 * Member-side comment thread on a shared task — the /team twin of the owner's
 * TaskComments. Both render `<CommentThread>`, so the anatomy, the composer and
 * the ordering are the same code; only the transport differs.
 *
 * Talks to /api/team/comments (team token auth; the server gates on the node
 * being actively shared). Members can read the whole thread and add their own
 * comments; moderation stays owner-side, so no `onDelete` is passed and the
 * button is absent rather than disabled.
 *
 * No SSE on the member surface (that stream is owner-gated), so the thread
 * polls at a slow interval — the documented best-effort remedy.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CommentThread } from '@mantle/web-ui/comment-thread';
import { teamFetch } from '@mantle/web-ui/team-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { NodeComment } from '@mantle/client-types';

const ROLE_CHIP: Record<NodeComment['authorKind'], string | null> = {
  owner: 'Owner',
  member: null, // members mostly read each other — the name is enough
  agent: 'Assistant',
};

export function TeamTaskComments({ nodeId }: { nodeId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const commentsQuery = useQuery({
    queryKey: ['team-task-comments', nodeId],
    queryFn: async () => {
      const r = await teamFetch(`/api/team/comments?nodeId=${encodeURIComponent(nodeId)}`);
      if (!r.ok) throw new Error(`comments failed (${r.status})`);
      const d = (await r.json()) as { comments: NodeComment[] };
      return d.comments;
    },
    refetchInterval: 30_000,
  });

  const send = async (body: string) => {
    try {
      const r = await teamFetch('/api/team/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, body }),
      });
      if (!r.ok) throw new Error(`send failed (${r.status})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add comment');
      return false; // keep the draft — a failed send must not lose the text
    }
    void queryClient.invalidateQueries({ queryKey: ['team-task-comments', nodeId] });
    return true;
  };

  return (
    <CommentThread
      comments={commentsQuery.data ?? []}
      pending={commentsQuery.isPending}
      roleChip={ROLE_CHIP}
      onSend={send}
      // Matches `TaskPresenter`'s own measure above it (`mx-auto max-w-2xl
      // px-6`), so the thread lines up with the task it discusses instead of
      // running the full width of the reader.
      className="mx-auto max-w-2xl px-6 pb-12"
    />
  );
}
