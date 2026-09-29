/**
 * Who filed a team change request, and where an admin answers them (the
 * /team-admin Requests tab). A request a member LOGIN filed has no contact
 * (member logins Phase 6): the brain's reply route (POST
 * /api/team-admin/notify, keyed by the task alone) posts into that login's
 * own chat thread, and the admin reads that thread on Member chats. A request
 * from the old team portal names a contact, whose chat is the Chat archive.
 */
// The C4 shape (fromClient); drop to '@mantle/client-types' with the shim.
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

/** A request a client filed (C4). Absent on a member's, and on every row
 *  from a brain before C4. */
export function isClientRequest(r: Pick<TeamRequest, 'fromClient'>): boolean {
  return r.fromClient === true;
}

/** Who it is from, in words: the contact's name, else a client or a team
 *  member (never "a team member" for a client, who is not one). */
export function requestFromText(r: Pick<TeamRequest, 'contactName' | 'fromClient'>): string {
  return r.contactName ?? (isClientRequest(r) ? 'a client' : 'a team member');
}
