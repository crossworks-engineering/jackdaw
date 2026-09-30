'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import type { AccessLevel, AccessNodeView, NodeComment } from '@mantle/client-types';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { CommentThread } from '@mantle/web-ui/comment-thread';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@mantle/web-ui/ui/sheet';
import { useToast } from '@mantle/web-ui/ui/toast';
import { useRealtime } from '@/components/realtime/use-realtime';
import { refusalMessage } from '@/lib/member-space';
import {
  CLIENT_THREAD_LINE,
  OWNER_THREAD_CHIPS,
  OWNER_THREAD_KEY,
  clientThreadLabel,
  ownerClientThreadPath,
  ownerCommentPath,
  ownerLevelKey,
  ownerThreadPath,
  showsClientThread,
  type OwnerThreadKind,
} from '@/lib/owner-client-thread';
import { useThreadPages } from '@/lib/use-thread-pages';

/**
 * The client thread, owner side (client logins C5 audit fix U2): on an item
 * at CLIENT level, a "Client comments" button in the item's header opens the
 * thread every client login reads and writes (decision 8), so an admin reads
 * a client's comment and answers it, even on a brain with no members. The
 * owner deletes any comment (moderation, as on a task). Nothing shows at any
 * other level.
 *
 * `audience`: the level, when the view has it fresh (a list row the Access
 * control's change refreshes). Without it the level is read from the Access
 * route, under the kind's list key, so a change of level shows or hides the
 * thread at once.
 */
export function OwnerClientThread({
  nodeId,
  type,
  audience,
  iconOnly = false,
}: {
  nodeId: string;
  type: OwnerThreadKind;
  audience?: AccessLevel | null;
  iconOnly?: boolean;
}) {
  const level = useQuery({
    queryKey: ownerLevelKey(type, nodeId),
    queryFn: () =>
      apiFetch<AccessNodeView>(`/api/access/nodes/${encodeURIComponent(nodeId)}`).then(
        (v) => v.item.audience,
      ),
    enabled: audience === undefined,
    retry: false,
  });
  const at = audience === undefined ? level.data : audience;
  if (!showsClientThread(at)) return null;
  return <ClientThreadButton nodeId={nodeId} iconOnly={iconOnly} />;
}

function ClientThreadButton({ nodeId, iconOnly }: { nodeId: string; iconOnly: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = [...OWNER_THREAD_KEY, nodeId];
  // Read the client scope only (C6); a comment is posted to the plain route.
  const path = ownerThreadPath(nodeId);
  const thread = useThreadPages<NodeComment>({
    queryKey: key,
    path: ownerClientThreadPath(nodeId),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  // A client's (or a member's) comment shows while the panel is open, and
  // the count on the button follows it.
  useRealtime(['comment'], (c) => {
    if (c.id && c.id !== nodeId) return;
    refresh();
  });

  const failed = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) return;
    toast.error(refusalMessage(err) ?? fallback);
  };
  const send = async (body: string) => {
    try {
      await apiSend(path, 'POST', { body });
    } catch (err) {
      failed(err, 'Could not post the comment.');
      return false; // keep the draft
    }
    refresh();
    return true;
  };
  const remove = async (id: string) => {
    try {
      await apiSend(ownerCommentPath(id), 'DELETE');
    } catch (err) {
      failed(err, 'Could not delete the comment.');
    }
    refresh();
  };

  const label = clientThreadLabel(thread.comments.length, thread.hasMore);
  return (
    <>
      <Button
        variant="outline"
        size={iconOnly ? 'icon-sm' : 'sm'}
        onClick={() => setOpen(true)}
        aria-label={label}
        title="The thread clients read on this item"
      >
        <MessagesSquare />
        {iconOnly ? null : label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Client comments</SheetTitle>
            <SheetDescription>{CLIENT_THREAD_LINE}</SheetDescription>
          </SheetHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 scrollbar-thin">
            {thread.query.isError && !thread.query.data ? (
              <p className="text-sm text-muted-foreground">Could not load the comments.</p>
            ) : (
              <CommentThread
                comments={thread.comments}
                pending={thread.query.isPending}
                roleChip={OWNER_THREAD_CHIPS}
                onSend={send}
                onDelete={(id) => void remove(id)}
                hasMore={thread.hasMore}
                onLoadOlder={thread.loadOlder}
                loadingOlder={thread.loadingOlder}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
