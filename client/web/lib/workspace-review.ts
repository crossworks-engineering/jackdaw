/**
 * Member items reviewed in their own workspace (workspace review pattern,
 * part 2, 2026-10-09): what a member submitted (a page, note, table, drawing
 * or file) waits in a "Waiting for approval" section above that workspace's
 * tree, and opens in its normal item pane with the review actions (Approve,
 * Reject, Take over, Discard) in its one header. Team admin > Review is gone.
 *
 * The brain's review routes are unchanged (/api/team-admin/submissions, admin
 * only, lib/member-review.ts): one queue for every kind, which each
 * workspace filters to its own. Pure helpers only.
 */
import type { ReviewItemRow } from './member-review';
import type { SpaceKind } from './member-space';

/** The selection param a workspace reads: `?review=<id>` opens a waiting
 *  item in the detail pane, beside the tree, as /apps does. */
export const REVIEW_PARAM = 'review';

/** Each kind's workspace screen and its name in words. */
export const REVIEW_WORKSPACE: Record<SpaceKind, { path: string; label: string }> = {
  page: { path: '/pages', label: 'Pages' },
  note: { path: '/notes', label: 'Notes' },
  table: { path: '/tables', label: 'Tables' },
  draw: { path: '/draw', label: 'Draw' },
  file: { path: '/files', label: 'Files' },
};

const isKind = (k: unknown): k is SpaceKind =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(REVIEW_WORKSPACE, k);

/** Where one waiting item opens: its workspace, the item in the pane. A kind
 *  this client does not know opens Pages. */
export function reviewItemHref(kind: string | null | undefined, id: string): string {
  const base = isKind(kind) ? REVIEW_WORKSPACE[kind].path : REVIEW_WORKSPACE.page.path;
  return `${base}?${REVIEW_PARAM}=${encodeURIComponent(id)}`;
}

/** One workspace's rows of the queue, in the queue's order: what members
 *  submitted (oldest first), then what deactivated logins left shared. Both
 *  wait for an admin's decision, so both list under "Waiting for approval". */
export function reviewRowsOf(
  items: readonly ReviewItemRow[] | null | undefined,
  kind: SpaceKind,
): ReviewItemRow[] {
  return (items ?? []).filter((i) => i.type === kind);
}

/** The "N waiting in Pages" links (Team admin, the needs-you notice): one
 *  per workspace that has something waiting, in the workspaces' order. */
export function waitingByWorkspace(
  items: readonly ReviewItemRow[] | null | undefined,
): { kind: SpaceKind; count: number; label: string; href: string }[] {
  const out: { kind: SpaceKind; count: number; label: string; href: string }[] = [];
  for (const kind of Object.keys(REVIEW_WORKSPACE) as SpaceKind[]) {
    const count = reviewRowsOf(items, kind).length;
    if (count === 0) continue;
    const { path, label } = REVIEW_WORKSPACE[kind];
    out.push({ kind, count, label: `${count} waiting in ${label}`, href: path });
  }
  return out;
}

/** Left behind: shared with the team by a login that is deactivated or gone,
 *  never submitted. Approve or Discard it; it cannot be rejected. */
export const isLeftBehind = (row: Pick<ReviewItemRow, 'reason'>) => row.reason === 'left-behind';

/** The small state badge beside the title, or null for a plain submission. */
export function reviewStateBadge(
  row: Pick<ReviewItemRow, 'reason' | 'reviewState'>,
): string | null {
  if (row.reason === 'left-behind') return 'Left behind';
  if (row.reviewState === 'taken') return 'Released';
  return null;
}

/** A row's one line of meta in the section: who, and when it started
 *  waiting. `when` is already formatted. */
export function reviewRowMeta(row: Pick<ReviewItemRow, 'reason' | 'author'>, when: string): string {
  const who = row.author.name || 'A member';
  if (row.reason === 'left-behind') return `${who} (inactive) · shared ${when}`;
  return `${who} · sent ${when}`;
}

/** The first line of the Info popover: what the admin is looking at. */
export function reviewInfoLine(row: Pick<ReviewItemRow, 'reason' | 'author'>): string {
  const who = row.author.name || 'a member';
  if (row.reason === 'left-behind') {
    return `Shared with the team by ${who}, who is no longer active. Approve it into the brain or discard it.`;
  }
  return `Submitted by ${who}. Waiting for your approval.`;
}

/** The Reject confirm: no note (review flows carry no messages). */
export function rejectConfirm(row: Pick<ReviewItemRow, 'author'>): string {
  return `It goes back to ${row.author.name || 'its author'}. They can change it and submit it again.`;
}
