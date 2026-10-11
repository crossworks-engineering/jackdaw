'use client';

/**
 * The rows of a bot's Telegram chats, for the people who moderate them (a
 * Moderator of the bot's assistant's workspace, or an Admin user with the
 * users area): each chat's label and id, whose it is (waiting for its user,
 * paired to a user, blocked) and Block, Unpair or Unblock. Never Pair: only
 * a chat's own user pairs it, with the code the bot sent them (workspaces
 * W7d). No level text. Used by Settings > Telegram (the chats you moderate)
 * and by an assistant's bot section.
 */

import { Button } from '@mantle/web-ui/ui/button';
import type { AgentTelegramChat } from '@/lib/contract/telegram';
import { moderateActions, telegramChatStatusText } from '@/lib/telegram-pairing';

export type TelegramChatRow = AgentTelegramChat & {
  /** The bot and assistant, when the list spans bots. */
  botUsername?: string;
  agentName?: string | null;
};

export function TelegramChatRows({
  chats,
  busyId,
  onAction,
  showBot = false,
}: {
  chats: readonly TelegramChatRow[];
  busyId: string | null;
  onAction: (chat: TelegramChatRow, action: 'block' | 'unpair') => void;
  showBot?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {chats.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              {c.label}{' '}
              <code className="text-[11px] text-muted-foreground">{c.telegramChatId}</code>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {showBot && c.botUsername
                ? `@${c.botUsername}${c.agentName ? `, ${c.agentName}` : ''}. `
                : ''}
              {telegramChatStatusText(c)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {moderateActions(c).map((a) => (
              <Button
                key={a.action}
                type="button"
                size="sm"
                variant={a.action === 'block' ? 'ghost' : 'outline'}
                onClick={() => onAction(c, a.action)}
                disabled={busyId === c.id}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
