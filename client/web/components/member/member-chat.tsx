'use client';

import { CHAT_NOT_OPEN_TEXT, memberChatRefusal } from '@/lib/member-chat';
import { ThreadChat, type ThreadChatConfig } from './thread-chat';

export const MEMBER_CHAT_KEY = ['member-chat'];

const MEMBER_CHAT: ThreadChatConfig = {
  path: '/api/member/chat',
  queryKey: MEMBER_CHAT_KEY,
  // Quickly while a reply is on its way; the realtime stream covers the rest.
  pollMs: (waiting) => (waiting ? 1500 : false),
  refusal: memberChatRefusal,
  inlineRefusals: false,
  closedText: CHAT_NOT_OPEN_TEXT,
  emptyText: (agent) => `Ask ${agent} anything the team has access to.`,
  failedText: 'That did not go through. Try again, or ask the admin.',
};

/**
 * A member's own chat with the Team workspace's assistant: the body of the
 * assistant dock for a member (MemberChatThread). One thread per login. The
 * body is the shared ThreadChat (a client's chat is its twin).
 */
export function MemberChat() {
  return <ThreadChat config={MEMBER_CHAT} />;
}
