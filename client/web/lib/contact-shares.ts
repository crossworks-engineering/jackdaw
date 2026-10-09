/**
 * Contact shares (brain migration 0214; brain docs/sharing.md section 4b):
 * one item shared with one contact. The contact opens the item's own link
 * with their personal code; the item's level never changes, so the team
 * never sees it. Read only; an app may let a contact write ("Can write").
 *
 * The rules the screens follow, kept pure so they are unit-tested
 * (contact-shares.test.ts). The calls are thin wrappers over the brain's
 * owner API.
 */
import type {
  AccessContactShare,
  AccessNodeView,
  ContactSharesPage,
  ContactSharesRevokedAll,
  ContactSharing,
  ContactSharingAction,
  ContactSharingResponse,
  CreateContactSharesResponse,
} from '@mantle/client-types';
import type { ContactRow } from '@mantle/content-core/contacts-format';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';

/** A contact row as a brain with contact shares answers it: `sharing` is
 *  null when off, and absent on a brain before 0214. */
export type SharingContactRow = ContactRow & { sharing?: ContactSharing | null };

/** The contact's "Shared" tab query. */
export const contactSharesKey = (contactId: string) => ['contacts', contactId, 'shares'] as const;

/** Whether this brain knows contact shares at all: a contact row from a
 *  brain before 0214 has no `sharing` key. */
export function brainHasContactShares(row: { sharing?: unknown } | null | undefined): boolean {
  return !!row && 'sharing' in row;
}

/** Contact shares are made on single items, never on a folder (v1). */
export function canShareWithContact(view: Pick<AccessNodeView, 'item' | 'canLower'>): boolean {
  return view.canLower && view.item.type !== 'branch';
}

/** "Can write" is offered for an app only. */
export function offersCanWrite(itemType: string): boolean {
  return itemType === 'app';
}

/**
 * Access matrix L21 (option B, the owner's call: a warning, no refusal). An
 * app's open link reads every row of the app's data, rows written by contacts
 * with "Can write" included (the brain answers read queries for anyone holding
 * the link). So the Access control warns where the two meet: an app with a
 * Can write contact that has, or is about to get, an open link; and an app
 * with an open link whose admin is about to give a contact Can write.
 */
export function openLinkReadsContactWrites(s: {
  itemType: string;
  /** The item has an open link now, or the picked level is about to make one. */
  openLink: boolean;
  /** Its contact shares now (absent on a brain before 0214). */
  shares: readonly Pick<AccessContactShare, 'canWrite'>[] | undefined;
  /** The admin is about to give one or more contacts Can write. */
  givingCanWrite?: boolean;
}): boolean {
  if (!offersCanWrite(s.itemType) || !s.openLink) return false;
  return !!s.givingCanWrite || (s.shares ?? []).some((x) => x.canWrite);
}

/** The L21 warning's words. */
export const OPEN_LINK_READS_CONTACT_WRITES =
  "Anyone with the open link can read all of this app's data, including what contacts with Can write put in it.";

/** The level toggle's extra line when the item is shared with contacts. */
export function contactSharesHint(
  shares: readonly AccessContactShare[] | undefined,
): string | null {
  const n = shares?.length ?? 0;
  if (n === 0) return null;
  return `Shared with ${n} contact${n === 1 ? '' : 's'}. The team does not see it.`;
}

/** Why a contact cannot be picked in the share dialog, or null when it can.
 *  Sharing off: greyed, with the way to turn it on. Already shared: greyed. */
export function pickBlocked(
  contact: Pick<SharingContactRow, 'id' | 'sharing'>,
  alreadyShared: ReadonlySet<string>,
): 'sharing-off' | 'already-shared' | null {
  if (alreadyShared.has(contact.id)) return 'already-shared';
  if (!contact.sharing) return 'sharing-off';
  return null;
}

/** The hint under a contact that cannot be picked. */
export const SHARING_OFF_HINT = 'Sharing off. Turn it on in Contacts.';

/** The contact's page in the owner app. */
export function contactHref(contactId: string): string {
  return `/contacts?id=${encodeURIComponent(contactId)}`;
}

/** The text under a shown-once code. */
export const CODE_SHOWN_ONCE = 'Shown once. Send it apart from the links.';

/** The switch-off confirmation, naming how many shares end. */
export function disableSharingLine(name: string, shareCount: number): string {
  const ends =
    shareCount === 0
      ? 'Nothing is shared with them now.'
      : `${shareCount} share${shareCount === 1 ? '' : 's'} with them will end.`;
  return `${name} can no longer open anything with their code. ${ends} Turning sharing on again gives a new code and starts with nothing shared.`;
}

/** The Revoke all confirmation. */
export function revokeAllLine(name: string, shareCount: number): string {
  return `${shareCount} item${shareCount === 1 ? '' : 's'} shared with ${name} will stop opening. Their code still works for anything you share later. No item's level changes.`;
}

/** When the contact last used their code, in words. */
export function lastUsedLine(sharing: ContactSharing, format: (iso: string) => string): string {
  return sharing.lastUsedAt
    ? `Their code was last used ${format(sharing.lastUsedAt)}`
    : 'Their code is not used yet';
}

// ── Calls ──────────────────────────────────────────────────────────────────

export function setContactSharing(contactId: string, action: ContactSharingAction) {
  return apiSend<ContactSharingResponse>(
    `/api/contacts/${encodeURIComponent(contactId)}/sharing`,
    'POST',
    { action },
  );
}

export function fetchContactShares(contactId: string, cursor?: string | null) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiFetch<ContactSharesPage>(`/api/contacts/${encodeURIComponent(contactId)}/shares${qs}`);
}

export function revokeAllContactShares(contactId: string) {
  return apiSend<ContactSharesRevokedAll>(
    `/api/contacts/${encodeURIComponent(contactId)}/shares`,
    'DELETE',
  );
}

export function shareWithContacts(nodeId: string, contactIds: string[], canWrite: boolean) {
  return apiSend<CreateContactSharesResponse>('/api/shares/contacts', 'POST', {
    nodeId,
    contactIds,
    ...(canWrite ? { canWrite: true } : {}),
  });
}

export function setShareCanWrite(shareId: string, canWrite: boolean) {
  return apiSend<{ ok: true; canWrite: boolean }>(
    `/api/shares/${encodeURIComponent(shareId)}`,
    'PATCH',
    { canWrite },
  );
}
