'use client';

/**
 * Settings > Logins > a login > Chat: a member's or a client's chat with the
 * team agent, read only (was Team admin > Member chats, moved 2026-10-09 when
 * Team admin started to dissolve). The brain route is unchanged and admin
 * only: GET /api/team-admin/member-chats?login=<id>, which answers the roster
 * plus a window of the selected login's thread.
 *
 * The route falls back to the roster's FIRST login when the asked one has no
 * row (an admin login, or a brain that predates a role), so the answer is
 * used only when its `selected.loginId` is this login: anything else reads
 * as "no chat", never as somebody else's thread.
 *
 * A login invited from a team contact also has its OLD team portal chat
 * (`portalThread`), in its own labelled, collapsed, read-only section, never
 * merged into the thread. "Load older" pages it with ?portalBefore=.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, ExternalLink, Loader2, MessagesSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  MemberChatArchiveMessage,
  MemberChatPortalThread,
  MemberChatsResponse,
} from '@mantle/client-types';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { NO_IMAGES } from '@mantle/web-ui/no-images';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { portalAtStart, portalCursor, prependOlder } from '@/lib/portal-thread';
import { loginChatOf } from '@/lib/login-chat';

export const memberChatKey = (loginId: string) => ['team-admin', 'member-chats', loginId] as const;

function chatPath(loginId: string, portalBefore?: string) {
  const qs = new URLSearchParams({ login: loginId });
  if (portalBefore) qs.set('portalBefore', portalBefore);
  return `/api/team-admin/member-chats?${qs}`;
}

/** The thread, oldest first: the login's messages on the right, the agent's
 *  replies (with a trace link) on the left. A reply draws no picture (client
 *  tier audit U5): a client can talk the agent into writing one, and it would
 *  load in the admin's browser. */
function ThreadMessages({ thread }: { thread: MemberChatArchiveMessage[] }) {
  return (
    <>
      {thread.map((m) =>
        m.direction === 'inbound' ? (
          <div
            key={m.id}
            className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
            <p className="mt-1 text-right text-xs text-primary-foreground/70">
              {formatDateTime(m.createdAt)}
            </p>
          </div>
        ) : (
          <div key={m.id} className="mr-auto w-full max-w-[85%] rounded-lg bg-muted/40 px-3 py-2">
            {m.status === 'failed' ? (
              <p className="text-sm text-destructive-ink">
                Turn failed: {m.error ?? 'unknown error'}
              </p>
            ) : m.status === 'pending' ? (
              <p className="text-sm italic text-muted-foreground">answering…</p>
            ) : (
              <div className="prose prose-accent prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={NO_IMAGES}>
                  {m.text}
                </ReactMarkdown>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDateTime(m.createdAt)}</span>
              {m.traceId ? (
                <Link
                  href={`/traces/${m.traceId}`}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  <ExternalLink className="size-3" /> trace
                </Link>
              ) : null}
            </div>
          </div>
        ),
      )}
    </>
  );
}

function PortalThread({ loginId, portal }: { loginId: string; portal: MemberChatPortalThread }) {
  const [thread, setThread] = useState(portal.thread);
  const [atStart, setAtStart] = useState(() => portalAtStart(portal.thread, portal.windowSize));
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const loadOlder = async () => {
    const cursor = portalCursor(thread);
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await apiFetch<MemberChatsResponse>(chatPath(loginId, cursor));
      const page = res.selected?.loginId === loginId ? res.selected.portalThread : null;
      const older = page?.thread ?? [];
      setThread((shown) => prependOlder(older, shown));
      setAtStart(portalAtStart(older, page?.windowSize ?? portal.windowSize));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load older messages');
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="rounded-lg border border-border bg-card text-card-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <Archive className="size-3.5" aria-hidden />
        Earlier team chat (before their member login)
        <span className="font-normal">· read only</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border/60 px-3 py-3">
        <p className="text-xs text-muted-foreground">
          Their chat on the old team portal. The member does not see it here, and the agent does not
          read it.
        </p>
        {!atStart && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center text-muted-foreground"
            disabled={loading}
            onClick={() => void loadOlder()}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Load older
          </Button>
        )}
        {thread.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">No messages.</p>
        ) : (
          <ThreadMessages thread={thread} />
        )}
      </div>
    </details>
  );
}

/** The Chat view's body: the login's thread with the team agent. */
export function LoginChat({ loginId, name }: { loginId: string; name: string }) {
  const q = useQuery({
    queryKey: memberChatKey(loginId),
    queryFn: () => apiFetch<MemberChatsResponse>(chatPath(loginId)),
  });

  if (q.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading the chat…</p>;
  }
  if (q.isError) {
    return (
      <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        Couldn&apos;t load the chat.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const chat = loginChatOf(q.data, loginId);
  if (!chat) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <MessagesSquare className="size-6" aria-hidden />
        <p>{name} has not chatted with the team agent.</p>
      </div>
    );
  }
  const { selected, messageCount } = chat;
  return (
    <div className="flex w-full flex-col gap-3 p-4">
      {selected.portalThread && (
        <PortalThread
          key={`${selected.loginId}:${selected.portalThread.contactId}`}
          loginId={selected.loginId}
          portal={selected.portalThread}
        />
      )}
      {selected.thread.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {name} has not chatted yet.
        </p>
      ) : (
        <>
          {messageCount > selected.thread.length && (
            <p className="text-center text-xs text-muted-foreground">
              Showing the latest {selected.thread.length} of {messageCount}.
            </p>
          )}
          <ThreadMessages thread={selected.thread} />
        </>
      )}
    </div>
  );
}
