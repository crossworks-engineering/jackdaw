'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, SendHorizontal } from 'lucide-react';
import type { MemberChatMessage } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { pollForPending, replyLanded, sendKey } from '@/lib/member-chat';

const GIVE_UP_MS = 120_000;

/** One login's own thread, as a member's and a client's chat both answer it. */
export type OwnThread = {
  agent: { name: string } | null;
  messages: readonly MemberChatMessage[];
};

/** A refused send: what to show, and what to do about it. */
export type SendRefusal = { message: string | null; reload: boolean; freshKey?: boolean };

/**
 * What differs between a member's chat and a client's: the route (each
 * login reaches its own only), how often it polls, what a refusal says and
 * where, and the words.
 */
export type ThreadChatConfig = {
  path: string;
  queryKey: readonly unknown[];
  /** Ask at all (false: the dock is closed). */
  enabled?: boolean;
  /** How often to ask again. `waiting`: a send in flight, a reply awaited,
   *  or a pending row seen lately. */
  pollMs: (waiting: boolean) => number | false;
  refusal: (e: unknown) => SendRefusal;
  /** true: a refusal stays under the thread (a limit reached is not
   *  transient); false: a toast. */
  inlineRefusals: boolean;
  maxChars?: number;
  tooLongText?: string;
  closedText: string;
  emptyText: (agentName: string) => string;
  failedText: string;
};

/**
 * The body of an own-thread chat: the messages and the composer. The reply
 * is written into the thread by the brain; this polls (no streaming: it
 * survives proxies that buffer, and a client has no stream at all).
 */
export function ThreadChat({ config }: { config: ThreadChatConfig }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // Set on send, cleared once the reply lands: the turn's rows appear a moment
  // after the POST returns, so "anything pending?" alone would stop polling.
  const [awaiting, setAwaiting] = useState<{ known: Set<string>; at: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // When this browser first saw each pending row (pollForPending), and the
  // last send's text and Idempotency-Key (a retry of the same text reuses it).
  const pendingSeen = useRef(new Map<string, number>());
  const lastSend = useRef<{ text: string; key: string } | null>(null);

  const thread = useQuery({
    queryKey: config.queryKey,
    queryFn: () => apiFetch<OwnThread>(config.path),
    enabled: config.enabled ?? true,
    refetchInterval: (q) =>
      config.pollMs(
        sendingRef.current ||
          awaiting !== null ||
          pollForPending(q.state.data?.messages ?? [], pendingSeen.current, Date.now()),
      ),
  });
  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages]);
  const last = messages[messages.length - 1];
  const waiting = sending || awaiting !== null || messages.some((m) => m.status === 'pending');

  // Stop the quick polling once the reply has landed (or failed); give up
  // after two minutes, which only happens when the brain never wrote the turn.
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
  }, [messages.length, lastStatus, notice]);

  const send = async () => {
    const body = text.trim();
    // The ref closes the gap before `sending` re-renders (a double Enter).
    if (!body || waiting || sendingRef.current) return;
    if (config.maxChars !== undefined && body.length > config.maxChars) {
      setNotice(config.tooLongText ?? 'That message is too long.');
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setGaveUp(false);
    setNotice(null);
    try {
      const known = new Set(messages.map((m) => m.id));
      const key = sendKey(body, lastSend.current, () => crypto.randomUUID());
      lastSend.current = { text: body, key };
      await apiFetch(config.path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ text: body }),
      });
      lastSend.current = null;
      setText('');
      setAwaiting({ known, at: Date.now() });
      await qc.invalidateQueries({ queryKey: config.queryKey });
    } catch (e) {
      const r = config.refusal(e);
      if (r.freshKey) lastSend.current = null;
      if (r.message) {
        if (config.inlineRefusals) setNotice(r.message);
        else toast.error(r.message);
      }
      // The brain's state changed (chat closed): reload the thread so the
      // screen says so instead of a lone message.
      if (r.reload) void qc.invalidateQueries({ queryKey: config.queryKey });
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
        <p className="max-w-sm text-center text-sm text-muted-foreground">{config.closedText}</p>
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
              {config.emptyText(thread.data?.agent?.name ?? 'the assistant')}
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
                    <p className="text-sm text-muted-foreground">{config.failedText}</p>
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
          {notice ? (
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink"
            >
              {notice}
            </p>
          ) : null}
          <div ref={bottom} />
        </div>
      </div>
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
            rows={1}
            className={cn('max-h-40 min-h-9 resize-none scrollbar-thin')}
          />
          <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim() || waiting}>
            {waiting ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </form>
      </div>
    </div>
  );
}
