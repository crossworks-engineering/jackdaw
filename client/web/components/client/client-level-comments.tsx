'use client';

import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { CommentThread } from '@mantle/web-ui/comment-thread';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  CLIENT_COMMENTS_KEY,
  askUnlessMissing,
  commentPath,
  commentsPollMs,
  isMissingRoute,
} from '@/lib/client-requests';
import type { NodeComment, NodeCommentAuthorKind } from '@mantle/client-types';
import type { ClientCommentThread } from '@/lib/contract-next';
import { refusalMessage } from '@/lib/member-space';
import { useThreadPages } from '@/lib/use-thread-pages';

/**
 * The thread on an item at CLIENT level (client logins C5, decision 8): the
 * team, the admins and every client login read and write it, each comment
 * under its author's name. The client reader and the member reader (a
 * client-level Library item) show the same thread, each through its own
 * route (`path`). Everyone deletes only their own comments.
 *
 * Read a page at a time (the newest 100, then Load older). No live stream
 * carries it: the thread is asked again every 30 seconds while open, and
 * when the window gets focus. A brain before C5 has no such route (404):
 * then there is no thread at all, and nothing asks for it again in this
 * page load (askUnlessMissing), not the poll, not a focus, not a remount.
 */
export function ClientLevelComments({
  path,
  chips,
}: {
  /** The thread's route: /api/client/shared/:id/comments for a client,
   *  /api/member/library/:id/comments for a member. */
  path: string;
  /** Which author kinds wear a chip, for this reader. */
  chips: Record<NodeCommentAuthorKind, string | null>;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const key = [...CLIENT_COMMENTS_KEY, path];
  const thread = useThreadPages<NodeComment>({
    queryKey: key,
    path,
    fetchPage: (p) => askUnlessMissing(path, () => apiFetch<ClientCommentThread>(p)),
    retry: (count, err) => !isMissingRoute(err) && count < 1,
    refetchInterval: commentsPollMs,
    refetchOnWindowFocus: true,
  });
  const q = thread.query;
  // No such route (an older brain), or the item left client level: nothing.
  if (isMissingRoute(q.error)) return null;
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const send = async (body: string) => {
    try {
      await apiSend(path, 'POST', { body });
      refresh();
      return true;
    } catch (err) {
      // The brain's sentence for its caps (a client's day, a full thread).
      toast.error(refusalMessage(err) ?? 'Could not post the comment.');
      return false;
    }
  };
  const remove = async (commentId: string) => {
    try {
      await apiSend(commentPath(path, commentId), 'DELETE');
    } catch (err) {
      toast.error(refusalMessage(err) ?? 'Could not delete the comment.');
    }
    refresh();
  };

  if (q.isError && !q.data) {
    return (
      <p className="border-t border-border pt-4 text-sm text-muted-foreground">
        Could not load the comments.
      </p>
    );
  }
  return (
    <CommentThread
      className="border-t border-border pt-4"
      comments={thread.comments}
      pending={q.isLoading}
      roleChip={chips}
      onSend={send}
      onDelete={(id) => void remove(id)}
      canDelete={(c) => c.mine}
      hasMore={thread.hasMore}
      onLoadOlder={thread.loadOlder}
      loadingOlder={thread.loadingOlder}
    />
  );
}
