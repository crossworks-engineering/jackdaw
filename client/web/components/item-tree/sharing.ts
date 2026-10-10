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
  TREE_SHARE_LEVELS,
  TREE_VISIBILITY_LIST_MAX,
  type TreeFolder,
  type TreeKind,
  type TreeShareLevel,
  type TreeVisibilityChange,
} from '@mantle/web-ui/types/tree';
import type { GrantWorkspaceRef } from '../../lib/contract/grants';

/** The levels a folder of this kind may be shared at. None on a kind that is
 *  not shareable (Recall, for now: the brain refuses its folder shares). */
export function shareLevelsOf(kind: TreeKind): readonly TreeShareLevel[] {
  const spec = TREE_KIND_SPECS[kind];
  return spec.shareable ? (spec.shareLevels ?? TREE_SHARE_LEVELS) : [];
}

/**
 * Whether the folder's menu offers Access (W5b: the Grant Access panel on
 * the folder). Not on the admin-only kinds and not on a system folder
 * (Auto-filed). The panel itself says when the brain has no grants yet.
 */
export function canGrantFolder(kind: TreeKind, folder: TreeFolder): boolean {
  return shareLevelsOf(kind).length > 0 && !folder.system;
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

/** A change the confirm lists: a tree write's (workspaces), or a member
 *  review accept's (levels, until W5c). */
export type VisibilityChange = TreeWorkspaceChange | TreeVisibilityChange;

/** The brain's "this changes who can see items" refusal, either shape. */
export type VisibilityRefusal = {
  error: 'visibility';
  changes: VisibilityChange[];
  total: number;
  /** A level refusal only (the review accept); never sent since W5b2. */
  alsoEmbeds?: TreeVisibilityChange[];
  embedsTotal?: number;
};

export const isWorkspaceChange = (c: VisibilityChange): c is TreeWorkspaceChange =>
  Array.isArray((c as TreeWorkspaceChange).alsoVisibleTo);

const isRef = (v: unknown): v is GrantWorkspaceRef =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as GrantWorkspaceRef).wsId === 'string' &&
  typeof (v as GrantWorkspaceRef).name === 'string';

function isLevelChange(v: unknown): v is TreeVisibilityChange {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.from === 'string' &&
    typeof c.to === 'string'
  );
}

/** A change in either shape, cleaned (malformed workspace refs dropped), or
 *  null when it is neither. */
function changeOf(v: unknown): VisibilityChange | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    Array.isArray(c.alsoVisibleTo) &&
    Array.isArray(c.removedFrom)
  ) {
    return {
      id: c.id,
      title: c.title,
      alsoVisibleTo: c.alsoVisibleTo.filter(isRef),
      removedFrom: c.removedFrom.filter(isRef),
    };
  }
  return isLevelChange(v) ? v : null;
}

/** The brain's "this would change who can see items" refusal, or null when
 *  the error is anything else. */
export function visibilityRefusal(err: unknown): VisibilityRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || body.error !== 'visibility' || !Array.isArray(body.changes)) return null;
  const changes = body.changes
    .map(changeOf)
    .filter((c: VisibilityChange | null): c is VisibilityChange => c !== null);
  const total =
    typeof body.total === 'number' ? Math.max(body.total, changes.length) : changes.length;
  const alsoEmbeds = Array.isArray(body.alsoEmbeds) ? body.alsoEmbeds.filter(isLevelChange) : [];
  const embedsTotal =
    typeof body.embedsTotal === 'number'
      ? Math.max(body.embedsTotal, alsoEmbeds.length)
      : alsoEmbeds.length;
  return {
    error: 'visibility',
    changes,
    total,
    ...(alsoEmbeds.length ? { alsoEmbeds, embedsTotal } : {}),
  };
}

/** What a confirm says it saw (`seen`): the items, and on a level refusal
 *  what they embed. The brain asks again when the change differs by then. */
export function seenOf(refusal: VisibilityRefusal): number {
  return refusal.total + (refusal.embedsTotal ?? 0);
}

/** Several refusals (a batch where each write was refused on its own) as
 *  one list for the dialog: every change, the totals added up, and what they
 *  embed, each item once. The list stays within what one refusal
 *  may carry. */
export function mergeRefusals(refusals: readonly VisibilityRefusal[]): VisibilityRefusal {
  const once = <T extends { id: string }>(lists: Array<readonly T[] | undefined>) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const list of lists) {
      for (const c of list ?? []) {
        // A new item has no id yet: each one counts.
        if (c.id && seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  };
  const changes = once(refusals.map((r) => r.changes)).slice(0, TREE_VISIBILITY_LIST_MAX);
  const alsoEmbeds = once(refusals.map((r) => r.alsoEmbeds)).slice(0, TREE_VISIBILITY_LIST_MAX);
  const total = Math.max(
    refusals.reduce((n, r) => n + r.total, 0),
    changes.length,
  );
  const embedsTotal = Math.max(
    refusals.reduce((n, r) => n + (r.embedsTotal ?? r.alsoEmbeds?.length ?? 0), 0),
    alsoEmbeds.length,
  );
  return {
    error: 'visibility',
    changes,
    total,
    ...(alsoEmbeds.length ? { alsoEmbeds, embedsTotal } : {}),
  };
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
  // Only what the items embed changes (a note already read at the folder's
  // share still opens its images there).
  if (n === 0 && refusal.alsoEmbeds?.length) return 'This changes who can see what they embed';
  return `This changes who can see ${n === 1 ? 'one item' : `${n} items`}`;
}
