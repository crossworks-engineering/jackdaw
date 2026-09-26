'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, SendHorizontal } from 'lucide-react';
import type { MemberChatThread } from '@mantle/client-types';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { replyLanded } from '@/lib/member-chat';

const KEY = ['member-chat'];
const GIVE_UP_MS = 120_000;

/**
 * A member's own chat with the brain's team-level agent. One thread per
 * login. The reply is written into the thread by the brain; this screen polls
 * while a reply is pending (no streaming: it survives proxies that buffer).
 */
export function MemberChat() {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // Set on send, cleared once the reply lands: the turn's rows appear a moment
  // after the POST returns, so "anything pending?" alone would stop polling.
  const [awaiting, setAwaiting] = useState<{ known: Set<string>; at: number } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<MemberChatThread>('/api/member/chat'),
    refetchInterval: (q) =>
      awaiting !== null || q.state.data?.messages.some((m) => m.status === 'pending')
        ? 1500
        : false,
  });
  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages]);
  const last = messages[messages.length - 1];
  const waiting = sending || awaiting !== null || messages.some((m) => m.status === 'pending');
  // false = this login has no team contact, so the brain refuses a send.
  const unlinked = thread.data?.linked === false;

  // Stop polling once the reply has landed (or failed); give up after two
  // minutes, which only happens when the brain never wrote the turn.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (awaiting === null) return;
    if (replyLanded(messages, awaiting.known)) {
      setAwaiting(null);
    } else if (Date.now() - awaiting.at > GIVE_UP_MS) {
      setAwaiting(null);
      setGaveUp(true);
    }
  }, [messages, awaiting]);

  const lastStatus = last?.status;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, lastStatus]);

  const send = async () => {
    const body = text.trim();
    // The ref closes the gap before `sending` re-renders (a double Enter).
    if (!body || waiting || unlinked || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setGaveUp(false);
    try {
      const known = new Set(messages.map((m) => m.id));
      await apiSend('/api/member/chat', 'POST', { text: body });
      setText('');
      setAwaiting({ known, at: Date.now() });
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not send that');
      }
      // A 409 means the brain's state changed (unlinked, or chat closed):
      // reload the thread so the screen says so instead of a lone toast.
      if (e instanceof ApiError && e.status === 409) void qc.invalidateQueries({ queryKey: KEY });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  if (thread.isError && !thread.data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">Could not load the chat.</p>
        <Button size="sm" variant="outline" onClick={() => void thread.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (thread.data && !thread.data.agent) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Chat is not open yet. The admin has to set a team-level assistant first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          {thread.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ask {thread.data?.agent?.name ?? 'the assistant'} anything the team has access to.
            </p>
          ) : (
            messages.map((m) =>
              m.direction === 'inbound' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[95%]">
                  {m.status === 'pending' ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
                    </p>
                  ) : m.failed ? (
                    <p className="text-sm text-muted-foreground">
                      That did not go through. Try again, or ask the admin.
                    </p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert prose-accent max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ),
            )
          )}
          {gaveUp && (
            <p className="text-sm text-muted-foreground">
              No reply yet. It may still arrive; reload the page to check.
            </p>
          )}
          <div ref={bottom} />
        </div>
      </div>
      {unlinked && (
        <p className="border-t border-border px-4 py-2 text-center text-sm text-muted-foreground">
          This login is not linked to a team contact yet, so it cannot send. Ask the admin to link
          it.
        </p>
      )}
      <div className="border-t border-border bg-background/80 p-3 backdrop-blur">
        <form
          className="mx-auto flex max-w-2xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message…"
            aria-label="Message"
            disabled={unlinked}
            rows={1}
            className={cn('max-h-40 min-h-9 resize-none scrollbar-thin')}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!text.trim() || waiting || unlinked}
          >
            {waiting ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </form>
      </div>
    </div>
  );
}
