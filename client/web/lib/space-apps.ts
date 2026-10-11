/**
 * Apps members build (brain team apps Phase 3): a member's own apps and the
 * ones teammates shared, on the member's Apps page, and, for an admin, the
 * ones members submitted or shared, in the admin's own Apps screen
 * (workspace review pattern, 2026-10-09). Members build over their own MCP
 * connection (the brain's `my_app_*` tools); here they share, submit, recall
 * and run them, and an admin tests, approves or sends them back.
 *
 * The types mirror the brain's `SpaceAppCard`, `ReviewWaitingApp`,
 * `ReviewSharedApp` and `MemberAppForReview` (@mantle/content
 * member-space-apps.ts); they live here until a contract package carries
 * them.
 *
 * Pure, pinned by space-apps.test.ts.
 */
import type { AppDataAccess } from './app-data-pill';

export type SpaceAppReviewState = 'draft' | 'submitted' | 'returned' | (string & {});

/** One app on a member's list (GET /api/member/my-apps). */
export type SpaceAppCard = {
  id: string;
  title: string;
  description: string | null;
  mine: boolean;
  /** The author's name, on a teammate's app. */
  authorName: string | null;
  sharing: 'private' | 'team';
  reviewState: SpaceAppReviewState;
  /** A green published build: it runs. */
  runnable: boolean;
  hasDraft: boolean;
  version: number;
  updatedAt: string;
  /** Absent from an older brain: no pill. */
  dataAccess?: AppDataAccess;
};

export const MY_APPS_PATH = '/api/member/my-apps';
export const MY_APPS_KEY = ['member-my-apps'] as const;

export function myAppActionPath(
  id: string,
  action: 'share' | 'submit' | 'recall' | 'delete' | 'undelete',
): string {
  return `${MY_APPS_PATH}/${encodeURIComponent(id)}/${action}`;
}

export function myAppHistoryPath(id: string): string {
  return `${MY_APPS_PATH}/${encodeURIComponent(id)}/history`;
}

/** One entry of an app's history (GET /api/member/my-apps/:id/history).
 *  `deletable`: a manual snapshot this login took, on an app that is not
 *  submitted (absent from a brain before v0.239.76: never deletable). */
export type MyAppHistoryEntry = {
  id: string;
  seq: number;
  kind: 'version' | 'snapshot';
  trigger: string;
  note: string | null;
  createdAt: string;
  deletable?: boolean;
};

/** DELETE: one of the member's own manual snapshots. */
export function myAppSnapshotPath(id: string, snapshotId: string): string {
  return `${myAppHistoryPath(id)}/${encodeURIComponent(snapshotId)}`;
}

// ── A member's own trash (brain access matrix N6) ───────────────────────────

/** One app in the member's trash (GET /api/member/my-apps/deleted). The
 *  brain's `DeletedSpaceApp`. Nothing in it expires. */
export type DeletedSpaceApp = {
  id: string;
  title: string;
  description: string | null;
  deletedAt: string;
  version: number;
  published: boolean;
  hasData: boolean;
};

export const MY_APPS_DELETED_PATH = `${MY_APPS_PATH}/deleted`;
/** Under MY_APPS_KEY, so every change to the member's apps refreshes it. */
export const MY_APPS_DELETED_KEY = [...MY_APPS_KEY, 'deleted'] as const;

/** The brain's caps: live apps per member, and apps in one trash. */
export const MY_APPS_MAX = 50;
export const MY_APPS_TRASH_MAX = 50;

/** Delete's short confirm: the question, then what undoes it. */
export function myAppDeleteConfirm(title: string): { title: string; body: string } {
  return {
    title: `Move ${title.trim() || 'Untitled'} to Trash?`,
    body: 'You can restore it from Trash.',
  };
}

export const MY_APP_DELETED_TOAST = 'Moved to Trash';
export const MY_APP_RESTORED_TOAST = 'Restored. It is private now.';
export const MY_APP_SNAPSHOT_DELETED_TOAST = 'Snapshot deleted';

/** What Trash is, behind its Info button. */
export const MY_APPS_TRASH_INFO = [
  'An app in Trash does not run, and nobody else sees it.',
  'Its code, data and history stay. Nothing in Trash is removed, and nothing expires.',
  `Restore brings it back private. Trash keeps at most ${MY_APPS_TRASH_MAX} apps.`,
];

/** An app the member opened is in their trash. */
export const MY_APP_IN_TRASH =
  'This app is in your Trash. Restore it from Trash in Apps to use it again.';

/** The brain's reason on a refused member app change, or null. */
export function myAppRefusalReason(err: unknown): string | null {
  const body = (err as { body?: unknown } | null)?.body;
  const reason = (body as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

/** The app is in the member's trash: the brain's 409 `deleted`. */
export function isMyAppInTrash(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return status === 409 && myAppRefusalReason(err) === 'deleted';
}

/** A refused Delete, Restore or snapshot delete in plain words, or null
 *  (then the brain's own message). The brain's words name MCP tools, which
 *  a member reading this screen does not use. */
export function myAppRefusal(err: unknown): string | null {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 409) {
    switch (myAppRefusalReason(err)) {
      case 'deleted':
        return MY_APP_IN_TRASH;
      case 'trash-full':
        return `Your Trash is full: it keeps at most ${MY_APPS_TRASH_MAX} apps. Restore one from Trash first, then try again.`;
      case 'limit':
        return `You already have ${MY_APPS_MAX} apps, the most one member keeps. Delete one you no longer need, then restore this one.`;
      case 'not-yours':
        return 'You can delete only snapshots you took yourself.';
      case 'frozen':
        return 'This app is frozen right now, so its snapshots cannot change.';
    }
  }
  return null;
}

/** How a member builds one: no button here builds, their MCP client does. */
export const MY_APPS_HOWTO =
  'To build an app, connect your own MCP client (Settings > MCP; it needs the Write switch on your MCP) and ask it to use the my_app tools. Your apps are private until you share them with the team or submit them to an admin.';

/** Under Share with team: what sharing gives every member. */
export const MY_APP_SHARE_HINT = 'Every member can run it and change its data.';

/** Under Submit: what a submit freezes. */
export const MY_APP_SUBMIT_HINT =
  'It freezes until an admin answers, and its data turns read only, also for teammates.';

/** The run view's note on an app under review. */
export const MY_APP_UNDER_REVIEW = 'Under review: read only';

/** The one line under an app: where it stands. */
export function spaceAppStatus(app: SpaceAppCard): string {
  if (!app.mine) return app.authorName ? `Shared by ${app.authorName}` : 'Shared with the team';
  const base = app.sharing === 'team' ? 'Shared with the team' : 'Private';
  if (app.reviewState === 'submitted') {
    return `Submitted for review. ${base}. Frozen until an admin answers; you can recall it.`;
  }
  const runs = app.runnable ? '' : '. Not published yet';
  if (app.reviewState === 'returned') {
    return `Rejected by an admin. ${base}${runs}. Change it and submit it again.`;
  }
  return `${base}${runs}.`;
}

/** What the author may do with their own app now. A teammate's app: run
 *  only. */
export function spaceAppActions(app: SpaceAppCard): {
  run: boolean;
  share: 'private' | 'team' | null;
  submit: boolean;
  recall: boolean;
} {
  const run = app.runnable;
  if (!app.mine) return { run, share: null, submit: false, recall: false };
  if (app.reviewState === 'submitted') return { run, share: null, submit: false, recall: true };
  return {
    run,
    share: app.sharing === 'team' ? 'private' : 'team',
    // The admin reviews what runs: a published build, no pending changes.
    submit: app.runnable && !app.hasDraft,
    recall: false,
  };
}

/** Why Submit is not offered on a draft or returned app, or null. */
export function spaceAppSubmitHint(app: SpaceAppCard): string | null {
  if (!app.mine || app.reviewState === 'submitted') return null;
  if (!app.runnable) return 'Publish it first (my_app_publish), then submit.';
  if (app.hasDraft) return 'It has changes that are not published. Publish them first.';
  return null;
}

/** An app a member runs from their own list, when the launcher list does
 *  not hold it (a member-built app is in no launcher). */
export function runnableSpaceApp(
  apps: readonly SpaceAppCard[] | undefined,
  id: string,
): SpaceAppCard | null {
  const app = apps?.find((a) => a.id === id.toLowerCase());
  return app && app.runnable ? app : null;
}

// ── Members' apps waiting or shared (the old GET /api/apps/members) ────────
// Removed in W5c with the review flow (the route is 410): only the type
// stays, for the Team admin stub (components/app-nav/member-apps-review.tsx).
// A later W5c part removes it.

/** The author as the review lists show them. */
export type ReviewAppAuthor = { loginId: string | null; name: string | null; active: boolean };

/** One app a member submitted (GET /api/apps/members `waiting`). */
export type ReviewWaitingApp = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  author: ReviewAppAuthor;
  submittedAt: string | null;
  version: number;
};

/** One app a member shared with the team (GET /api/apps/members `shared`). */
export type ReviewSharedApp = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  author: ReviewAppAuthor;
  lastActivityAt: string;
  runnable: boolean;
};

export type ReviewAppLists = { waiting: ReviewWaitingApp[]; shared: ReviewSharedApp[] };

/** The Team admin link to what waits in Apps, or null when nothing does. */
export function waitingInAppsLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} waiting in Apps`;
}

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
  /** Last day it can be restored. */
  purgeAfter: string;
  hasData: boolean;
  dbBytes: number | null;
};

export const DELETED_APPS_PATH = '/api/apps/deleted';
export const DELETED_APPS_KEY = ['apps', 'deleted'] as const;

export function deletedAppRestorePath(id: string): string {
  return `${DELETED_APPS_PATH}/${encodeURIComponent(id)}/restore`;
}
