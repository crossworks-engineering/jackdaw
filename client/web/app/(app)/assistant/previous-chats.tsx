'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquareReply } from 'lucide-react';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import type {
  AssistantTimelineRow,
  ChatArchiveResponse,
  ChatThreadRow,
} from '@mantle/client-types';
import { groupTurns } from './assistant-turns';
import { TurnRow } from './turn-row';
import {
  PREVIOUS_CHATS_LABEL,
  messageCount,
  newChatToast,
  previousChats,
  threadSpan,
  threadTitle,
} from './chat-threads-state';

/** Same page size as the live chat's scroll-up pager. */
const PAGE = 100;

/**
 * "Previous chats": the chats this agent's New chat button put away (chat
 * archive, mantle docs/conversation.md §6c), newest first. Picking one opens
 * it read-only.
 */
export function PreviousChatsList({
  agentSlug,
  onOpen,
  onBack,
}: {
  agentSlug: string;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const query = useQuery({
    queryKey: ['assistant', 'threads', agentSlug],
    queryFn: () =>
      apiFetch<{ threads: ChatThreadRow[] }>(
        `/api/assistant/threads?agent=${encodeURIComponent(agentSlug)}`,
      ),
  });
  const items = useMemo(() => previousChats(query.data?.threads ?? []), [query.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-2">
        <Button variant="ghost" size="xs" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Back to chat
        </Button>
        <h2 className="text-sm font-semibold text-foreground">{PREVIOUS_CHATS_LABEL}</h2>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 scrollbar-thin">
        {query.isPending ? (
          <div className="flex justify-center p-10">
            <Spinner />
          </div>
        ) : query.isError ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load the previous chats.
          </p>
        ) : items.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No previous chats yet. When you start a new chat, the current one is saved here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 px-5 py-3">
            {items.map((t) => (
              <li key={t.id}>
                <RowButton
                  onClick={() => onOpen(t.id)}
                  className="w-full rounded-md px-3 py-2 hover:bg-muted/60"
                >
                  <span className="block truncate text-sm font-medium text-foreground">
                    {threadTitle(t)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {threadSpan(t)} · {messageCount(t.turnCount)}
                  </span>
                  {t.summary && (
                    <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                      {t.summary}
                    </span>
                  )}
                </RowButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One previous chat, read-only: its summary on top, then the transcript. The
 * one action is "Continue from this": a new chat that starts with this chat's
 * summary (not its messages). The current chat is saved first, like New chat.
 */
export function PreviousChatView({
  threadId,
  agentName,
  accentBorder,
  onBack,
  onContinued,
}: {
  threadId: string;
  agentName: string | undefined;
  accentBorder: string;
  onBack: () => void;
  onContinued: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [older, setOlder] = useState<AssistantTimelineRow[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const query = useQuery({
    queryKey: ['assistant', 'chat-thread', threadId],
    queryFn: () =>
      apiFetch<{ thread: ChatThreadRow; messages: AssistantTimelineRow[] }>(
        `/api/assistant/threads/${encodeURIComponent(threadId)}`,
      ),
  });
  const messages = useMemo(() => [...older, ...(query.data?.messages ?? [])], [older, query.data]);
  const turns = useMemo(() => groupTurns(messages), [messages]);
  const more = hasMore ?? (query.data?.messages.length ?? 0) >= PAGE;

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    setLoadingOlder(true);
    try {
      const page = await apiFetch<{ messages: AssistantTimelineRow[] }>(
        `/api/assistant/messages?thread=${encodeURIComponent(threadId)}&before=${encodeURIComponent(first.createdAt)}&limit=${PAGE}`,
      );
      setOlder((cur) => [...page.messages, ...cur]);
      setHasMore(page.messages.length >= PAGE);
    } catch {
      toast.error('Couldn’t load older messages. Try again.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function continueFromThis() {
    setContinuing(true);
    try {
      const r = await apiSend<ChatArchiveResponse>(
        `/api/assistant/threads/${encodeURIComponent(threadId)}/continue`,
        'POST',
      );
      await queryClient.invalidateQueries({ queryKey: ['assistant'] });
      const t = newChatToast(r);
      toast[t.kind](t.text);
      onContinued();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t start the new chat. Try again.');
    } finally {
      setContinuing(false);
    }
  }

  async function writeSummary() {
    setSummarizing(true);
    try {
      await apiSend(`/api/assistant/threads/${encodeURIComponent(threadId)}/summarize`, 'POST');
      await queryClient.invalidateQueries({ queryKey: ['assistant'] });
    } catch {
      toast.error('The summary could not be written. Try again later.');
    } finally {
      setSummarizing(false);
    }
  }

  const thread = query.data?.thread;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
        <Button variant="ghost" size="xs" onClick={onBack}>
          <ArrowLeft aria-hidden />
          {PREVIOUS_CHATS_LABEL}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {thread ? threadTitle(thread) : ''}
          </p>
          {thread && (
            <p className="text-xs text-muted-foreground">
              {threadSpan(thread)} · {messageCount(thread.turnCount)} · read-only
            </p>
          )}
        </div>
        <Button
          size="xs"
          className="shrink-0"
          disabled={!thread || continuing}
          onClick={continueFromThis}
          title="Start a new chat that picks up from this one's summary. The current chat is saved in Previous chats."
        >
          <MessageSquareReply aria-hidden />
          Continue from this
        </Button>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-4 scrollbar-thin">
        {query.isPending ? (
          <div className="flex justify-center p-10">
            <Spinner />
          </div>
        ) : query.isError || !thread ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this chat.
          </p>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5">
            <section className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </h3>
              {thread.summary ? (
                <p className="whitespace-pre-wrap text-foreground">{thread.summary}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>No summary yet.</span>
                  <Button
                    variant="outline"
                    size="2xs"
                    disabled={summarizing}
                    onClick={writeSummary}
                  >
                    Write summary
                  </Button>
                </div>
              )}
            </section>
            {more && (
              <div className="flex justify-center">
                <Button variant="ghost" size="xs" disabled={loadingOlder} onClick={loadOlder}>
                  Load older messages
                </Button>
              </div>
            )}
            <ul className="flex flex-col">
              {turns.map((turn, idx) => (
                <TurnRow
                  key={turn.id}
                  turn={turn}
                  idx={idx}
                  accentBorder={accentBorder}
                  agentName={agentName}
                  showTyping={false}
                  live={null}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
