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
  'To build an app, connect your own MCP client (Settings > MCP) and ask it to use the my_app tools. Your apps are private until you share them with the team or submit them to an admin.';

/** The one line under an app: where it stands. */
export function spaceAppStatus(app: SpaceAppCard): string {
  if (!app.mine) return app.authorName ? `Shared by ${app.authorName}` : 'Shared with the team';
  if (app.reviewState === 'submitted')
    return 'Submitted for review. Frozen until an admin answers.';
  const base = app.sharing === 'team' ? 'Shared with the team' : 'Private';
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
  'Without this, the app runs its tools at team rules for everyone, admins too. Tick it only when you checked every declared tool.';

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
