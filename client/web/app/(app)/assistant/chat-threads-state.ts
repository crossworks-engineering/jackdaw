/**
 * Pure helpers for "New chat" and "Previous chats" (chat archive, mantle
 * docs/conversation.md §6c). The words are fixed here so the button, the list,
 * the toasts and the Telegram /new reply on the brain all say the same thing:
 * the UI says "New chat" and "Previous chats", never "archive".
 */
import { formatDate, formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import type { ChatArchiveResponse, ChatThreadRow } from '@mantle/web-ui/types/chat-threads';

export const NEW_CHAT_LABEL = 'New chat';
export const PREVIOUS_CHATS_LABEL = 'Previous chats';
export const NEW_CHAT_HINT =
  'Start a new chat. The current chat stays saved and searchable in Previous chats.';

/** What the chat window shows under its header. */
export type ChatView = { kind: 'live' } | { kind: 'list' } | { kind: 'thread'; id: string };

/** The archived threads, newest first (the open thread is the live chat). */
export function previousChats(threads: readonly ChatThreadRow[]): ChatThreadRow[] {
  return threads
    .filter((t) => t.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
}

/** A thread's name: its title, else the day it started. */
export function threadTitle(t: Pick<ChatThreadRow, 'title' | 'startedAt'>): string {
  return t.title?.trim() || `Chat of ${formatDate(t.startedAt)}`;
}

/** "5 Oct 2026, 09:12 to 6 Oct 2026, 11:40" (one date when both are the same day). */
export function threadSpan(t: Pick<ChatThreadRow, 'startedAt' | 'archivedAt'>): string {
  if (!t.archivedAt) return `since ${formatDateTime(t.startedAt)}`;
  const from = formatDateTime(t.startedAt);
  const to = formatDateTime(t.archivedAt);
  const sameDay = formatDate(t.startedAt) === formatDate(t.archivedAt);
  return sameDay ? `${formatDate(t.startedAt)}` : `${from} to ${to}`;
}

/** "12 messages" (a turn here is one message, either side). */
export function messageCount(n: number): string {
  return `${n} message${n === 1 ? '' : 's'}`;
}

/** The toast after New chat (or Continue from this). */
export function newChatToast(r: ChatArchiveResponse): { kind: 'success' | 'info'; text: string } {
  if (!r.archived) {
    return r.open?.continuedFrom
      ? { kind: 'success', text: 'New chat started from the previous chat.' }
      : { kind: 'info', text: 'This is already a new chat.' };
  }
  const name = r.archived.title ? `"${r.archived.title}"` : 'The previous chat';
  return {
    kind: 'success',
    text: `New chat started. ${name} is saved in Previous chats.`,
  };
}
