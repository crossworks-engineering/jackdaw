'use client';

/**
 * Settings > Telegram (workspaces W7d), for every login. Three parts:
 *
 *  - Pair Telegram: the user pairs THEIR OWN chat with the code the bot sent
 *    them (components/telegram/telegram-pair-form.tsx, a preview, then
 *    Confirm).
 *  - My chats: the user's own paired chats (GET /api/telegram/my-chats),
 *    each with Unpair (DELETE /api/telegram/my-chats/:id). Nobody else's.
 *  - Chats you moderate: only when there are any (GET
 *    /api/telegram/moderated-chats: a Moderator of a bot's assistant's
 *    workspace, or an Admin user with the users area), with Block, Unpair
 *    or Unblock (POST /api/telegram/chats/:id/block | unpair). Never Pair.
 *
 * A login carries no permission and there are no levels.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import type { ModeratedTelegramChat, MyTelegramChat } from '@/lib/contract/telegram';
import {
  MODERATED_TELEGRAM_CHATS_KEY,
  MODERATED_TELEGRAM_CHATS_PATH,
  MY_TELEGRAM_CHATS_KEY,
  MY_TELEGRAM_CHATS_PATH,
  moderateTelegramChatPath,
  moderatedText,
  myTelegramChatPath,
} from '@/lib/telegram-pairing';
import { TelegramPairForm } from '@/components/telegram/telegram-pair-form';
import { TelegramChatRows, type TelegramChatRow } from '@/components/telegram/telegram-chat-rows';

function Section({
  icon,
  title,
  blurb,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
        <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        </div>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.message ? e.message : fallback;

export function TelegramSettingsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: MY_TELEGRAM_CHATS_KEY,
    queryFn: () => apiFetch<{ chats: MyTelegramChat[] }>(MY_TELEGRAM_CHATS_PATH),
  });
  const moderated = useQuery({
    queryKey: MODERATED_TELEGRAM_CHATS_KEY,
    queryFn: () => apiFetch<{ chats: ModeratedTelegramChat[] }>(MODERATED_TELEGRAM_CHATS_PATH),
  });
  const [unpairTarget, setUnpairTarget] = useState<MyTelegramChat | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: MY_TELEGRAM_CHATS_KEY });
    void queryClient.invalidateQueries({ queryKey: MODERATED_TELEGRAM_CHATS_KEY });
  };

  const unpairMine = async () => {
    const chat = unpairTarget;
    setUnpairTarget(null);
    if (!chat) return;
    setBusyId(chat.id);
    try {
      await apiSend(myTelegramChatPath(chat.id), 'DELETE');
      toast.success('Unpaired');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(errorText(e, 'Could not unpair the chat.'));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const moderate = async (chat: TelegramChatRow, action: 'block' | 'unpair') => {
    setBusyId(chat.id);
    try {
      await apiSend(moderateTelegramChatPath(chat.id, action), 'POST');
      toast.success(moderatedText(action, chat.status === 'denied'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(errorText(e, 'Could not update the chat.'));
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const moderatedChats = moderated.data?.chats ?? [];

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-thin">
      <div className="w-full space-y-6 p-4 md:p-6">
        <Section
          icon={<Send className="size-4" />}
          title="Pair Telegram"
          blurb="Talk to your assistant on Telegram. Only you pair your own chat, signed in here, with the code the bot sends you."
        >
          <TelegramPairForm onPaired={refresh} />
        </Section>

        <Section
          icon={<MessageCircle className="size-4" />}
          title="My chats"
          blurb="The Telegram chats paired to you. Unpair one and it stops reaching your assistant until you pair it again."
        >
          {mine.isPending ? (
            <Spinner />
          ) : mine.isError ? (
            <div className="flex items-center gap-3 text-sm">
              <p className="text-destructive-ink">
                {errorText(mine.error, 'Could not load your chats.')}
              </p>
              <Button variant="outline" size="sm" onClick={() => void mine.refetch()}>
                Try again
              </Button>
            </div>
          ) : mine.data.chats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Telegram chat is paired to you.</p>
          ) : (
            <ul
              className="divide-y divide-border rounded-lg border border-border"
              data-testid="telegram-my-chats"
            >
              {mine.data.chats.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {c.label}{' '}
                      <code className="text-[11px] text-muted-foreground">{c.telegramChatId}</code>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{c.botUsername}
                      {c.agentName ? `, ${c.agentName}` : ''}
                      {c.lastMessageAt ? `. Last message ${formatDateTime(c.lastMessageAt)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setUnpairTarget(c)}
                    disabled={busyId === c.id}
                  >
                    Unpair
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {moderatedChats.length > 0 ? (
          <Section
            icon={<ShieldCheck className="size-4" />}
            title="Chats you moderate"
            blurb="The chats of the bots whose workspaces you moderate. You can block or unpair a chat; only its own user pairs it."
          >
            <TelegramChatRows chats={moderatedChats} busyId={busyId} onAction={moderate} showBot />
          </Section>
        ) : null}
      </div>

      <AlertDialog open={unpairTarget !== null} onOpenChange={(o) => !o && setUnpairTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair {unpairTarget?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The chat stops reaching your assistant. Pair it again any time with a new code from
              the bot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={unpairMine}>Unpair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
