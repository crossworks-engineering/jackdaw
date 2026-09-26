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

const KEY = ['member-chat'];

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
  // Set on send, cleared once the reply lands: the turn's rows appear a moment
  // after the POST returns, so "anything pending?" alone would stop polling.
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<MemberChatThread>('/api/member/chat'),
    refetchInterval: (q) =>
      awaitingSince !== null || q.state.data?.messages.some((m) => m.status === 'pending')
        ? 1500
        : false,
  });
  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages]);
  const last = messages[messages.length - 1];
  const waiting = sending || awaitingSince !== null || messages.some((m) => m.status === 'pending');

  // The reply has landed (or failed) once the newest row is a finished
  // outbound written after the send. Give up waiting after two minutes.
  useEffect(() => {
    if (awaitingSince === null) return;
    const landed =
      last?.direction === 'outbound' &&
      last.status !== 'pending' &&
      new Date(last.createdAt).getTime() >= awaitingSince - 5_000;
    if (landed || Date.now() - awaitingSince > 120_000) setAwaitingSince(null);
  }, [last, awaitingSince]);

  const lastStatus = last?.status;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, lastStatus]);

  const send = async () => {
    const body = text.trim();
    if (!body || waiting) return;
    setSending(true);
    try {
      const sentAt = Date.now();
      await apiSend('/api/member/chat', 'POST', { text: body });
      setText('');
      setAwaitingSince(sentAt);
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error ? e.message : 'Could not send that');
      }
    } finally {
      setSending(false);
    }
  };

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
