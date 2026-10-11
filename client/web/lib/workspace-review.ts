/**
 * Removed in W5c: the owner screens no longer show "Waiting for approval" or
 * the review actions (workspaces replace review). What stays here is used
 * ONLY by app/(app)/team-admin/page.tsx and components/review/review-redirect.tsx
 * (the "N waiting in Pages" strip and old ?view=review links), which a later
 * W5c part removes with Team admin. Delete this file then. Pure helpers.
 */
import type { ReviewItemRow } from './member-review';
import type { SpaceKind } from './member-space';

/** The old selection param (`?review=<id>`). No screen reads it now. */
const REVIEW_PARAM = 'review';

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
