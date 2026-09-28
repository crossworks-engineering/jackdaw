/**
 * Who filed a team change request, and where an admin answers them (the
 * /team-admin Requests tab). A request a member LOGIN filed has no contact
 * (member logins Phase 6): the brain's reply route (POST
 * /api/team-admin/notify, keyed by the task alone) posts into that login's
 * own chat thread, and the admin reads that thread on Member chats. A request
 * from the old team portal names a contact, whose chat is the Chat archive.
 */
import type { TeamRequest } from '@mantle/client-types';

/** Can an admin reply to whoever filed it? Either a login or a contact. */
export function canReplyToRequest(r: Pick<TeamRequest, 'contactId' | 'loginId'>): boolean {
  return Boolean(r.loginId || r.contactId);
}

/** Where "View their chat" goes: the login's Member chat (where a reply to
 *  it lands), else the contact's Chat archive, else nowhere. */
export function requestChatHref(r: Pick<TeamRequest, 'contactId' | 'loginId'>): string | null {
  if (r.loginId) return `/team-admin?view=chats&login=${encodeURIComponent(r.loginId)}`;
  if (r.contactId) return `/team-admin?contact=${encodeURIComponent(r.contactId)}`;
  return null;
}
