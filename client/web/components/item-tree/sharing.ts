/**
 * Folder access as the tree shows it: which folders offer the Access panel
 * (grants, W5b2), and the brain's refusal of a write that would change which
 * workspaces read items until it is repeated with `confirm` (contract 29).
 *
 * Pure: no React, so the rules are unit-tested (sharing.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  TREE_KIND_SPECS,
  TREE_VISIBILITY_LIST_MAX,
  type TreeFolder,
  type TreeKind,
} from '@mantle/web-ui/types/tree';
import type { GrantWorkspaceRef } from '../../lib/contract/grants';

/**
 * Whether the folder's menu offers Access (W5b: the Grant Access panel on
 * the folder). Only on a shareable kind (not the admin-only kinds, and not
 * Recall for now) and not on a system folder (Auto-filed). The panel itself
 * says when the brain has no grants yet. No level is offered or read: a
 * folder is shared by workspace grants (W8).
 */
export function canGrantFolder(kind: TreeKind, folder: TreeFolder): boolean {
  return TREE_KIND_SPECS[kind].shareable && !folder.system;
}

/**
 * One item a tree write would change (W5b2 contract 29): which workspaces
 * would also read it and which would no longer. Mirrors the brain's
 * TreeWorkspaceChange (mantle packages/client-types/src/tree.ts at
 * 69a2ccd15); local until a client-types release carries it. `id` is ''
 * for an item not made yet (a create or upload).
 */
export type TreeWorkspaceChange = {
  id: string;
  title: string;
  alsoVisibleTo: GrantWorkspaceRef[];
  removedFrom: GrantWorkspaceRef[];
};

/** The brain's "this changes who can see items" refusal: each item and the
 *  workspaces it gains and loses. (The level refusal of an Accept of a
 *  private item went with the private items in W6b; levels went in W8.) */
export type VisibilityRefusal = {
  error: 'visibility';
  changes: TreeWorkspaceChange[];
  total: number;
};

const isRef = (v: unknown): v is GrantWorkspaceRef =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as GrantWorkspaceRef).wsId === 'string' &&
  typeof (v as GrantWorkspaceRef).name === 'string';

/** A change, cleaned (malformed workspace refs dropped), or null when it is
 *  not one. */
function changeOf(v: unknown): TreeWorkspaceChange | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (
    typeof c.id !== 'string' ||
    typeof c.title !== 'string' ||
    !Array.isArray(c.alsoVisibleTo) ||
    !Array.isArray(c.removedFrom)
  ) {
    return null;
  }
  return {
    id: c.id,
    title: c.title,
    alsoVisibleTo: c.alsoVisibleTo.filter(isRef),
    removedFrom: c.removedFrom.filter(isRef),
  };
}

/** The brain's "this would change who can see items" refusal, or null when
 *  the error is anything else. */
export function visibilityRefusal(err: unknown): VisibilityRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || body.error !== 'visibility' || !Array.isArray(body.changes)) return null;
  const changes = body.changes
    .map(changeOf)
    .filter((c: TreeWorkspaceChange | null): c is TreeWorkspaceChange => c !== null);
  const total =
    typeof body.total === 'number' ? Math.max(body.total, changes.length) : changes.length;
  return { error: 'visibility', changes, total };
}

/** What a confirm says it saw (`seen`): the items. The brain asks again when
 *  the change differs by then. */
export function seenOf(refusal: VisibilityRefusal): number {
  return refusal.total;
}

/** Several refusals (a batch where each write was refused on its own) as
 *  one list for the dialog: every change, each item once, the totals added
 *  up. The list stays within what one refusal may carry. */
export function mergeRefusals(refusals: readonly VisibilityRefusal[]): VisibilityRefusal {
  const seen = new Set<string>();
  const changes: TreeWorkspaceChange[] = [];
  for (const r of refusals) {
    for (const c of r.changes) {
      // A new item has no id yet: each one counts.
      if (c.id && seen.has(c.id)) continue;
      seen.add(c.id);
      changes.push(c);
    }
  }
  const listed = changes.slice(0, TREE_VISIBILITY_LIST_MAX);
  const total = Math.max(
    refusals.reduce((n, r) => n + r.total, 0),
    listed.length,
  );
  return { error: 'visibility', changes: listed, total };
}

/** The words for one workspace change: who also reads it, who stops. */
export function workspaceChangeWords(c: TreeWorkspaceChange): {
  added: string | null;
  removed: string | null;
} {
  const names = (refs: readonly GrantWorkspaceRef[]) =>
    refs.length ? refs.map((r) => r.name).join(', ') : null;
  return { added: names(c.alsoVisibleTo), removed: names(c.removedFrom) };
}

/** The confirm dialog's heading. */
export function refusalHeading(refusal: VisibilityRefusal): string {
  const n = refusal.total;
  return `This changes who can see ${n === 1 ? 'one item' : `${n} items`}`;
}
