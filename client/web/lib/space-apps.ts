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

// ── The admin's review, in Apps (workspace review pattern) ─────────────────

/** The author as the review lists show them. */
export type ReviewAppAuthor = { loginId: string | null; name: string | null; active: boolean };

/** One app in "Waiting for approval" (GET /api/apps/members `waiting`). */
export type ReviewWaitingApp = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  author: ReviewAppAuthor;
  submittedAt: string | null;
  version: number;
};

/** One app in "Shared by members" (GET /api/apps/members `shared`). */
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

/** One member app for the review screen (GET /api/apps/members/:id): its
 *  PUBLISHED source only. `reviewHash` only while it waits for approval. */
export type ReviewAppDetail = {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  author: ReviewAppAuthor;
  sharing: 'private' | 'team';
  reviewState: string;
  version: number;
  submittedAt: string | null;
  updatedAt: string;
  declaredTools: string[];
  dataReadOnly: boolean;
  runnable: boolean;
  entry: string;
  files: Record<string, string>;
  reviewHash: string | null;
};

export const REVIEW_APPS_PATH = '/api/apps/members';
/** Under ['apps'], so every app change refreshes the review lists too. */
export const REVIEW_APPS_KEY = ['apps', 'members'] as const;

export type ReviewAppAction =
  'history' | 'activity' | 'accept' | 'send-back' | 'unshare' | 'delete' | 'test';

export function reviewAppPath(id: string, action?: ReviewAppAction): string {
  const base = `${REVIEW_APPS_PATH}/${encodeURIComponent(id)}`;
  return action ? `${base}/${action}` : base;
}

/** Where the admin opens one: in the Apps pane, beside the tree. */
export function reviewAppHref(id: string): string {
  return `/apps?review=${encodeURIComponent(id)}`;
}

/** Waiting for approval while submitted; else shared with the team. */
export function reviewKind(app: Pick<ReviewAppDetail, 'reviewState'>): 'waiting' | 'shared' {
  return app.reviewState === 'submitted' ? 'waiting' : 'shared';
}

function authorOf(app: { author: ReviewAppAuthor }): string {
  return app.author.name ?? 'a member';
}

/** The banner on the review screen. */
export function reviewBannerText(app: Pick<ReviewAppDetail, 'reviewState' | 'author'>): string {
  return reviewKind(app) === 'waiting'
    ? `Submitted by ${authorOf(app)}. Waiting for your approval.`
    : `Shared with the team by ${authorOf(app)}.`;
}

/** The one line under a shared app on the list. */
export function sharedAppMeta(app: ReviewSharedApp, when: string): string {
  if (!app.author.active) return `${authorOf(app)}, no longer active: it runs for nobody`;
  return `${authorOf(app)} · last used ${when}`;
}

/** What the test run is, above the running app. */
export const REVIEW_TEST_NOTE =
  'Test run: it runs at team rules on a copy of its data. Nothing real changes, and the copy goes when you leave.';

/** The test copy ended (left, or idle too long). */
export const REVIEW_TEST_ENDED = 'The test run ended. Start it again to keep testing.';

/** A test refused a tool that writes or reaches outside (the brain's
 *  reason 'review-test-read-only'). */
export const REVIEW_TEST_BLOCKED =
  'Test mode blocks tools that change data or reach outside the brain.';

/** A declared tool the team rules refuse (the brain's reason 'team-rules'):
 *  not test mode, so it fails in every member's run too. `why` is the
 *  brain's own words for the rule. */
export function reviewTeamRulesRefused(why: unknown): string {
  const rule = typeof why === 'string' && why.trim() ? ` ${why.trim()}` : '';
  return `The team rules refuse this tool, so it fails for members too, not only in this test.${rule}`;
}

/** What a test broker answer means for the screen: the copy is gone
 *  (409 `test-ended`: idle too long, dropped for a newer copy, or ended in
 *  another tab), a tool test mode blocks, a tool the team rules refuse, or
 *  nothing special. */
export function reviewBrokerOutcome(
  status: number,
  body: unknown,
): 'ended' | 'blocked' | 'team-rules' | null {
  const reason = (body as { reason?: unknown } | null)?.reason;
  if (status === 409 && reason === 'test-ended') return 'ended';
  if (status === 403 && reason === 'review-test-read-only') return 'blocked';
  if (status === 403 && reason === 'team-rules') return 'team-rules';
  return null;
}

/** The app moved while the admin had it open (a 409 on Approve, or a newer
 *  version on refetch): what they read is not what would be approved. */
export function reviewAppChanged(version: number): string {
  return `This app changed since you opened it: it is now version ${version}. The test restarted on it. Read it again, then approve.`;
}

/** What Reject does, in the confirm. */
export function sendBackConfirm(app: Pick<ReviewAppDetail, 'author'>): string {
  return `It goes back to ${authorOf(app)}. They can change it and submit it again.`;
}

/** The Team admin link to what waits in Apps, or null when nothing does. */
export function waitingInAppsLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} waiting in Apps`;
}

export type AppAcceptLevel = 'admin' | 'team';

/** What accepting does, in one line per choice. */
export const APP_ACCEPT_LEVEL_MEANING: Record<AppAcceptLevel, string> = {
  admin: 'Admin: only admins run it. You can lower it later.',
  team: 'Team: every member runs it and writes its data.',
};

export const APP_TRUST_TOOLS_HINT =
  'With this, when an admin opens the app, its code (written by a member) calls these tools with your reach and can store what it reads where members see it. Read the source too. Without it, the app runs its tools at team rules for everyone, admins too.';

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

/** The confirm dialog's lines before an Accept: the level, the trust
 *  choice and the version, as they will be sent. */
export function acceptSummary(opts: {
  level: AppAcceptLevel;
  trust: boolean;
  version: number;
}): string[] {
  return [
    `Version ${opts.version}, the one you read.`,
    APP_ACCEPT_LEVEL_MEANING[opts.level],
    opts.trust
      ? 'Its tools run at the rules of whoever runs it, admins included.'
      : 'Its tools run at team rules for everyone, admins too.',
  ];
}

// ── Members' apps, as an admin acts on them (access matrix N2) ──────────────

export const MEMBER_APP_DELETE_CONFIRM =
  'It moves to the trash; you can restore it for 30 days, under Recently deleted apps in Apps. Its code and data are kept as a snapshot. Members can no longer run it.';

export const MEMBER_APP_DELETED_TOAST =
  'Moved to the trash. Restore it under Recently deleted apps for 30 days.';

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

// ── A member app's activity, in plain words ──────────────────────────────────

/** One row of GET /api/apps/members/:id/activity. `contactName` is
 *  who ran it: a contact, or a member or client login by name. */
export type MemberAppActivity = {
  id: string;
  kind: string;
  contactName: string | null;
  actorId?: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

const ACTIVITY_KIND: Record<string, string> = {
  auth: 'Opened',
  tool: 'Used a tool',
  db: 'Data',
  error: 'Error',
};

const DB_OP: Record<string, string> = {
  list: 'Listed the app',
  query: 'Read data',
  exec: 'Changed data',
};

/** What happened, in plain words: the kind, then the tool or data step. */
export function activityLabel(e: Pick<MemberAppActivity, 'kind' | 'detail'>): string {
  const d = e.detail ?? {};
  const slug = typeof d.slug === 'string' ? d.slug : null;
  const op = typeof d.op === 'string' ? d.op : null;
  if (e.kind === 'tool' && slug) return `Used ${slug}`;
  if (e.kind === 'db' && op) return DB_OP[op] ?? 'Data';
  return ACTIVITY_KIND[e.kind] ?? 'Activity';
}

/** Who did it: the name the brain gave, else how they came in. */
export function activityWho(e: Pick<MemberAppActivity, 'contactName' | 'detail'>): string {
  if (e.contactName) return e.contactName;
  const via = e.detail?.via;
  if (via === 'member') return 'A member';
  if (via === 'client') return 'A client';
  if (via === 'public') return 'A visitor';
  if (via === 'owner') return 'An admin';
  if (via === 'review-test') return 'An admin, testing';
  return 'Someone';
}

/** The write a connector call made, with its input (kept up to 2 KB), or
 *  null for a read. */
export function activityWrite(
  e: Pick<MemberAppActivity, 'detail'>,
): { input: string | null } | null {
  const d = e.detail ?? {};
  if (d.write !== true) return null;
  return { input: typeof d.input === 'string' && d.input ? d.input : null };
}

/** Why the brain refused the call, or null. */
export function activityRefused(e: Pick<MemberAppActivity, 'detail'>): string | null {
  const r = e.detail?.refused;
  return typeof r === 'string' && r ? r : null;
}

export const MEMBER_APP_UNSHARE_HINT =
  'Unshare: the app goes back to private. Only its author runs it; nothing is deleted.';

/** The source files in reading order: the entry first, then by path. */
export function submissionFiles(detail: Pick<ReviewAppDetail, 'entry' | 'files'>): {
  path: string;
  text: string;
}[] {
  return Object.entries(detail.files)
    .map(([path, text]) => ({ path, text }))
    .sort((a, b) =>
      a.path === detail.entry ? -1 : b.path === detail.entry ? 1 : a.path.localeCompare(b.path),
    );
}
