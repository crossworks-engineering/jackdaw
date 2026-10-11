/**
 * Apps in the brain: the trust switch and the recently deleted apps. Since
 * workspaces W6b a member's apps are brain apps too (homed in its private
 * workspace), on the one Apps screen; the member's own app list and trash
 * (/api/member/my-apps) are gone.
 *
 * Pure, pinned by space-apps.test.ts.
 */

// ── The trust switch on a brain app ─────────────────────────────────────────

/** The trust switch on an app in the brain (PATCH /api/apps/:id
 *  `{ trustTools }`): shown only when the brain sends `authorLevel`. */
export const APP_TRUST_LABEL = 'Trust its tools';
export const APP_TRUST_OFF_HINT =
  'Its tools run at team rules for everyone, admins too: a member wrote it, or it came from a copy, an import or a restore.';
export const APP_TRUST_ON_HINT = 'Its tools run at the rules of whoever runs it.';

/** The trust switch's confirm: what trusting gives code the admin did not
 *  write (a member's, or a copy's, an import's or a restore's). */
export const APP_TRUST_CONFIRM =
  'With this, when an admin opens the app, code you did not write calls these tools with your reach and can store what it reads where members see it. Read the source first.';

/** Whether the app page shows the trust switch: while the brain says the
 *  app ever ran at the ceiling (on or off), or, on a brain before that
 *  flag, while it is capped. Null: an older brain with no ceiling at all. */
export function showsTrustSwitch(app: object): boolean {
  const seen = (app as { authorCeilingSeen?: unknown }).authorCeilingSeen;
  if (typeof seen === 'boolean') return seen;
  return appAuthorLevel(app) === 'team';
}

/** The author ceiling as the brain sent it, or null (an older brain). */
export function appAuthorLevel(app: object): 'admin' | 'team' | null {
  const v = (app as { authorLevel?: unknown }).authorLevel;
  return v === 'admin' || v === 'team' ? v : null;
}

// ── The brain's recently deleted apps (GET /api/apps/deleted) ────────────────

/** One deleted app that can still come back. A member app an admin deleted
 *  lands here too (brain M4 audit, medium 2). */
export type DeletedApp = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  deletedAt: string;
  /** Last day it can be restored; null while it waits for the brain's
   *  owner (a delete by any other login, W6b fix round contract change 6:
   *  the nightly sweep never removes it). */
  purgeAfter: string | null;
  hasData: boolean;
  dbBytes: number | null;
};

export const DELETED_APPS_PATH = '/api/apps/deleted';
export const DELETED_APPS_KEY = ['apps', 'deleted'] as const;

export function deletedAppRestorePath(id: string): string {
  return `${DELETED_APPS_PATH}/${encodeURIComponent(id)}/restore`;
}

/** What the trash says a deleted app does until it is gone (W6b fix round):
 *  the brain owner's own deletes stay until a day; any other login's delete
 *  stays until the brain owner deletes it for good. */
export const DELETED_APP_HELD_TEXT = 'Kept until the brain owner deletes it for good.';

/** The note under the Recently deleted apps heading. */
export const DELETED_APPS_NOTE =
  'Restore a deleted app with its data, for admins only. An app the brain owner deleted stays 30 days. An app another user deleted stays until the brain owner deletes it for good.';

/** One trash row's second line. `day` formats the last day. */
export function deletedAppLine(
  d: Pick<DeletedApp, 'purgeAfter' | 'hasData'>,
  day: (iso: string) => string,
): string {
  const until = d.purgeAfter ? `Restore until ${day(d.purgeAfter)}.` : DELETED_APP_HELD_TEXT;
  return d.hasData ? until : `${until} No data was kept.`;
}
