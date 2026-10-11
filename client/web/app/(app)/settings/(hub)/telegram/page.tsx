import { SetPageTitle } from '@/components/layout/page-title';
import { TelegramSettingsClient } from './telegram-settings-client';

/**
 * /settings/telegram: a user's own Telegram chats (workspaces W7d), for
 * every login. Data-free: pair a chat with the code the bot sent, list and
 * unpair your own chats, and, for the chats of bots you moderate, block or
 * unpair them (telegram-settings-client.tsx).
 */
export default async function TelegramSettingsPage() {
  return (
    <>
      <SetPageTitle title="Telegram" />
      <TelegramSettingsClient />
    </>
  );
}
