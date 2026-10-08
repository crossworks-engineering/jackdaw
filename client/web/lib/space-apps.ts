/**
 * Apps members build (brain team apps Phase 3): a member's own apps and the
 * ones teammates shared, on the member's Apps page, and the apps members
 * submitted, on Team admin > App review. Members build over their own MCP
 * connection (the brain's `my_app_*` tools); here they share, submit, recall
 * and run them, and an admin accepts or returns them.
 *
 * The types mirror the brain's `SpaceAppCard` and `SpaceAppSubmission`
 * (@mantle/content member-space-apps.ts); they live here until a contract
 * package carries them.
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
  returnedNote: string | null;
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

export function myAppActionPath(id: string, action: 'share' | 'submit' | 'recall'): string {
  return `${MY_APPS_PATH}/${encodeURIComponent(id)}/${action}`;
}

export function myAppHistoryPath(id: string): string {
  return `${MY_APPS_PATH}/${encodeURIComponent(id)}/history`;
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
  if (app.reviewState === 'returned') return `Returned by an admin. ${base}${runs}.`;
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

// ── The admin's review ───────────────────────────────────────────────────────

/** One submitted app (GET /api/team-admin/app-submissions). */
export type AppSubmission = {
  id: string;
  title: string;
  description: string | null;
  author: { loginId: string | null; name: string | null };
  submittedAt: string | null;
  version: number;
  declaredTools: string[];
};

/** One submitted app with its published source (GET .../:id). */
export type AppSubmissionDetail = AppSubmission & {
  entry: string;
  files: Record<string, string>;
  /** What the accept sends back with `version` (the brain refuses a
   *  version the admin was not shown). Absent from an older brain. */
  reviewHash?: string;
};

export const APP_SUBMISSIONS_PATH = '/api/team-admin/app-submissions';
export const APP_SUBMISSIONS_KEY = ['team-admin', 'app-submissions'] as const;

export function appSubmissionPath(id: string, action?: 'accept' | 'return'): string {
  const base = `${APP_SUBMISSIONS_PATH}/${encodeURIComponent(id)}`;
  return action ? `${base}/${action}` : base;
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

// ── Members' apps, as an admin sees them (access matrix N2) ──────────────────

/** One member app an admin sees: team-shared or submitted, never a private
 *  draft (GET /api/team-admin/member-apps). */
export type AdminMemberApp = {
  id: string;
  title: string;
  author: { loginId: string | null; name: string | null; active: boolean };
  sharing: 'private' | 'team';
  reviewState: string;
  runnable: boolean;
  declaredTools: string[];
  updatedAt: string;
};

export const MEMBER_APPS_ADMIN_PATH = '/api/team-admin/member-apps';
export const MEMBER_APPS_ADMIN_KEY = ['team-admin', 'member-apps'] as const;

export function memberAppAdminPath(id: string, action?: 'unshare' | 'delete' | 'activity'): string {
  const base = `${MEMBER_APPS_ADMIN_PATH}/${encodeURIComponent(id)}`;
  return action ? `${base}/${action}` : base;
}

/** The one line under a member app on the admin's list. */
export function adminMemberAppStatus(app: AdminMemberApp): string {
  const who = app.author.name ?? 'a member';
  if (!app.author.active)
    return `By ${who}, who is no longer an active member: it runs for nobody.`;
  if (app.reviewState === 'submitted') return `By ${who}. Submitted for review.`;
  return app.runnable
    ? `By ${who}. Shared with the team: every member runs it.`
    : `By ${who}. Shared with the team, not published yet.`;
}

export const MEMBER_APP_DELETE_CONFIRM =
  'The app goes to the trash, and its code and data are kept as a snapshot first. Members can no longer run it.';

export const MEMBER_APP_UNSHARE_HINT =
  'Unshare: the app goes back to private. Only its author runs it; nothing is deleted.';

/** The source files in reading order: the entry first, then by path. */
export function submissionFiles(detail: Pick<AppSubmissionDetail, 'entry' | 'files'>): {
  path: string;
  text: string;
}[] {
  return Object.entries(detail.files)
    .map(([path, text]) => ({ path, text }))
    .sort((a, b) =>
      a.path === detail.entry ? -1 : b.path === detail.entry ? 1 : a.path.localeCompare(b.path),
    );
}
