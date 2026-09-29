'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, X } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { AreaBackdrop } from '@mantle/web-ui/area-backdrop';
import { Button } from '@mantle/web-ui/ui/button';
import { cn } from '@mantle/web-ui/lib/utils';
import { ThreadChat, type ThreadChatConfig } from '@/components/member/thread-chat';
import {
  CLIENT_CHAT_CLOSED_TEXT,
  CLIENT_CHAT_KEY,
  CLIENT_CHAT_MAX_CHARS,
  CLIENT_CHAT_PATH,
  clientChatPollMs,
  clientChatRefusal,
  clientChatTooLongText,
} from '@/lib/client-chat';
import type { ClientChatThread } from '@/lib/contract-next';

/**
 * A client's own chat (client logins C4): a launcher on the home, and a
 * dock with the client's thread with the client-level agent. The client's
 * own route only (/api/client/chat), and polling only: a client has no live
 * stream. The dock names the agent, never a person.
 */

type DockApi = { open: boolean; setOpen: (open: boolean) => void };
const DockContext = createContext<DockApi | null>(null);

/** The dock's open state, shared by the launcher (on the home) and the dock
 *  (in the client chrome). */
export function ClientChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const api = useMemo(() => ({ open, setOpen }), [open]);
  return <DockContext.Provider value={api}>{children}</DockContext.Provider>;
}

function useDock(): DockApi {
  const api = useContext(DockContext);
  if (!api) throw new Error('ClientChatProvider is missing');
  return api;
}

/** Opens (and closes) the chat, from the home's header. */
export function ClientChatLauncher() {
  const { open, setOpen } = useDock();
  return (
    <Button
      size="sm"
      variant={open ? 'default' : 'outline'}
      className="shrink-0"
      aria-pressed={open}
      onClick={() => setOpen(!open)}
    >
      <MessageSquare aria-hidden />
      Chat
    </Button>
  );
}

/**
 * The dock: a window at the bottom right on a wide screen, the whole screen
 * below the top bar on a phone. Mounted once first opened and kept (so a
 * half-written message survives closing it); it asks nothing while closed.
 */
export function ClientChatDock() {
  const { open, setOpen } = useDock();
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  if (!everOpened) return null;
  return (
    <section
      aria-label="Chat"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-[var(--top-bar-h)] z-40 flex-col overflow-hidden border-border bg-background shadow-lg',
        'md:inset-auto md:bottom-4 md:right-4 md:h-[min(40rem,calc(100vh-2rem))] md:w-[26rem] md:rounded-lg md:border',
        open ? 'flex' : 'hidden',
      )}
    >
      <ClientChatBody open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function ClientChatBody({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  // The header's name: the same query the body reads (one fetch).
  const thread = useQuery({
    queryKey: CLIENT_CHAT_KEY,
    queryFn: () => apiFetch<ClientChatThread>(CLIENT_CHAT_PATH),
    enabled: open,
  });
  // Opened again: ask at once, not at the next poll (none ran while closed).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) void qc.invalidateQueries({ queryKey: CLIENT_CHAT_KEY });
    wasOpen.current = open;
  }, [open, qc]);

  const config = useMemo<ThreadChatConfig>(
    () => ({
      path: CLIENT_CHAT_PATH,
      queryKey: CLIENT_CHAT_KEY,
      enabled: open,
      pollMs: (waiting) => clientChatPollMs({ open, waiting }),
      refusal: clientChatRefusal,
      // A limit reached lasts the day: it stays in view, not in a toast.
      inlineRefusals: true,
      maxChars: CLIENT_CHAT_MAX_CHARS,
      tooLongText: clientChatTooLongText(),
      closedText: CLIENT_CHAT_CLOSED_TEXT,
      emptyText: (agent) => `Ask ${agent} about what has been shared with you.`,
      failedText: 'That did not go through. Try again.',
    }),
    [open],
  );

  const agent = thread.data?.agent ?? null;
  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col">
      <AreaBackdrop area="chat" className="-z-10" />
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <MessageSquare className="size-5 shrink-0 text-primary-ink" aria-hidden />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight">
              {agent ? agent.name : 'Chat'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your own chat. Other clients do not see it.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close chat">
          <X aria-hidden />
        </Button>
      </header>
      <ThreadChat config={config} />
    </div>
  );
}
