'use client';

/**
 * Telegram bot binding for a responder/assistant agent — shared between the
 * `/settings/agents` editor and the onboarding wizard's Telegram step, so both
 * surfaces drive the *same* connect → pair → manage flow against the same API
 * (`/api/agents/[id]/telegram` + `/telegram/chats`).
 *
 * Loads the agent's currently-linked bot (if any) and lets the operator paste a
 * token to connect / rotate, or disconnect. The token is validated (getMe) +
 * sealed server-side; only the bot @username + poll status come back here.
 *
 * Telegram per user (workspaces W7d): a chat is paired to ONE user, by that
 * user, signed in, with the code the bot sent them (the pair form below, the
 * same as Settings > Telegram). Nobody approves another person's chat: the
 * brain refuses status 'allowed' (403 pair_with_code). This section lists
 * the bot's chats for the people who moderate it, with Block, Unpair or
 * Unblock ('denied' blocks, 'pending' unpairs). Polls every 10s so a fresh
 * DM shows up without a manual refresh. No level text: levels are gone.
 * A refused Connect stays under the token field, in the brain's words.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { FieldError } from '@mantle/web-ui/ui/field';
import { SecretInput } from '@mantle/web-ui/ui/secret-input';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import type { AgentTelegramBinding } from '@mantle/client-types';
import type { AgentTelegramChat } from '@/lib/contract/telegram';
import { agentChatStatusFor, moderatedText } from '@/lib/telegram-pairing';
import { TelegramChatRows } from './telegram-chat-rows';
import { TelegramPairForm } from './telegram-pair-form';

const CONNECT_ERROR_ID = 'telegram-connect-error';

export function TelegramBotSection({ agentId }: { agentId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  // undefined = loading, null = not linked.
  const [binding, setBinding] = useState<AgentTelegramBinding | null | undefined>(undefined);
  const [chats, setChats] = useState<AgentTelegramChat[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyChat, setBusyChat] = useState<string | null>(null);
  // A refused Connect, in the brain's words, kept under the token field.
  const [connectError, setConnectError] = useState<string | null>(null);

  // `initial` shows the loading state + flips to null on failure; polled
  // refreshes update in place without flashing.
  const load = useCallback(
    async (initial = false) => {
      if (initial) setBinding(undefined);
      try {
        const b = await apiFetch<{
          binding?: AgentTelegramBinding | null;
          chats?: AgentTelegramChat[];
        }>(`/api/agents/${agentId}/telegram`);
        setBinding(b.binding ?? null);
        setChats(b.chats ?? []);
      } catch {
        if (initial) setBinding(null);
      }
    },
    [agentId],
  );

  useEffect(() => {
    setToken('');
    setConnectError(null);
    void load(true);
    // Poll so a fresh DM's pairing request shows up without a manual refresh.
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const connect = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setConnectError(null);
    let b: { binding?: AgentTelegramBinding };
    try {
      b = await apiSend<{ binding?: AgentTelegramBinding }>(
        `/api/agents/${agentId}/telegram`,
        'POST',
        {
          token: token.trim(),
        },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.message) {
        setConnectError(e.message);
        return;
      }
      toast.error(e instanceof Error ? e.message : 'Could not link the bot.');
      return;
    } finally {
      setBusy(false);
    }
    if (!b.binding) {
      toast.error('Could not link the bot.');
      return;
    }
    setToken('');
    toast.success(`Linked @${b.binding.botUsername}`);
    void load();
    startRefresh(() => router.refresh());
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/agents/${agentId}/telegram`, 'DELETE');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not unlink the bot.');
      return;
    } finally {
      setBusy(false);
    }
    setBinding(null);
    setChats([]);
    setToken('');
    toast.success('Bot unlinked');
    startRefresh(() => router.refresh());
  };

  const moderate = async (chat: AgentTelegramChat, action: 'block' | 'unpair') => {
    setBusyChat(chat.id);
    try {
      await apiSend(`/api/agents/${agentId}/telegram/chats`, 'POST', {
        chatId: chat.id,
        status: agentChatStatusFor(action),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not update the chat.');
      return;
    } finally {
      setBusyChat(null);
    }
    toast.success(moderatedText(action, chat.status === 'denied'));
    void load();
  };

  if (binding === undefined) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }

  const allowedCount = chats.filter((c) => c.status === 'allowed').length;

  return (
    <div className="space-y-2">
      {binding && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
            <Send className="size-3.5" aria-hidden />@{binding.botUsername}
          </span>
          {binding.enabled ? (
            <span className="inline-flex items-center gap-1 text-xs text-success-ink">
              <span className="size-1.5 rounded-full bg-success" aria-hidden /> polling
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">disabled</span>
          )}
          {allowedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {allowedCount} paired chat{allowedCount === 1 ? '' : 's'}
            </span>
          )}
          {binding.lastPollError && (
            <span className="truncate text-xs text-destructive-ink" title={binding.lastPollError}>
              {binding.lastPollError}
            </span>
          )}
        </div>
      )}

      {/* The bot's chats, for the people who moderate it: Block, Unpair or
          Unblock. Never Approve: a chat's own user pairs it, with its code. */}
      {binding && chats.length > 0 && (
        <TelegramChatRows chats={chats} busyId={busyChat} onAction={moderate} />
      )}

      {/* The signed-in user pairs their own chat on this bot. */}
      {binding && (
        <div className="rounded-md border border-border p-3">
          <TelegramPairForm onPaired={() => void load()} />
        </div>
      )}

      <SecretInput
        noun="token"
        autoComplete="off"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void connect();
          }
        }}
        placeholder={binding ? 'Paste a new token to rotate…' : 'Paste your bot token…'}
        className="h-9 font-mono text-sm"
        aria-invalid={connectError ? true : undefined}
        aria-describedby={connectError ? CONNECT_ERROR_ID : undefined}
      />
      <FieldError id={CONNECT_ERROR_ID}>{connectError}</FieldError>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={connect} disabled={busy || !token.trim()}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {binding ? 'Update token' : 'Connect bot'}
        </Button>
        {binding && (
          <Button type="button" size="sm" variant="outline" onClick={disconnect} disabled={busy}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
