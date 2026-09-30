/**
 * Folder sharing as the tree shows it (the brain's docs/folder-tree.md,
 * "Sharing a folder (phase 4)"): which folders offer a share, the words for a
 * share, and the brain's refusal of a write that would change who can see
 * items until it is repeated with `confirm`.
 *
 * Pure: no React, so the rules are unit-tested (sharing.test.ts).
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  TREE_KIND_SPECS,
  TREE_SHARE_LEVELS,
  type TreeFolder,
  type TreeKind,
  type TreeShareLevel,
  type TreeVisibilityChange,
  type TreeVisibilityRefusal,
} from '@mantle/web-ui/types/tree';

/** The levels a folder of this kind may be shared at (Recall: team only). */
export function shareLevelsOf(kind: TreeKind): readonly TreeShareLevel[] {
  const spec = TREE_KIND_SPECS[kind];
  return spec.shareable ? (spec.shareLevels ?? TREE_SHARE_LEVELS) : [];
}

/**
 * Whether the folder's menu offers a share. Not on the admin-only kinds, not
 * on a system folder (Auto-filed), and not on a brain before folder sharing:
 * such a brain sends no `inherited` on its folders, and would refuse the
 * field.
 */
export function canShareFolder(kind: TreeKind, folder: TreeFolder): boolean {
  return shareLevelsOf(kind).length > 0 && !folder.system && folder.inherited !== undefined;
}

export const SHARE_LABEL: Record<TreeShareLevel, string> = {
  team: 'Team',
  client: 'Clients',
};

/** The shared glyph's tooltip on a folder row: its own share, else the one
 *  it takes from a folder above (null when neither). */
export function shareTitle(folder: Pick<TreeFolder, 'share' | 'inherited'>): string | null {
  if (folder.share === 'team') return 'Shared with the team, and everything in it';
  if (folder.share === 'client') return 'Shared with clients, and everything in it';
  if (folder.inherited === 'team') return 'Shared with the team by a folder above';
  if (folder.inherited === 'client') return 'Shared with clients by a folder above';
  return null;
}

/** The share a folder row shows a glyph for: its own, else the inherited
 *  one (drawn quieter). */
export function shownShare(
  folder: Pick<TreeFolder, 'share' | 'inherited'>,
): { level: TreeShareLevel; own: boolean } | null {
  if (folder.share) return { level: folder.share, own: true };
  if (folder.inherited) return { level: folder.inherited, own: false };
  return null;
}

function isChange(v: unknown): v is TreeVisibilityChange {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.from === 'string' &&
    typeof c.to === 'string'
  );
}

/** The brain's "this would change who can see items" refusal, or null when
 *  the error is anything else. */
export function visibilityRefusal(err: unknown): TreeVisibilityRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || body.error !== 'visibility' || !Array.isArray(body.changes)) return null;
  const changes = body.changes.filter(isChange);
  const total =
    typeof body.total === 'number' ? Math.max(body.total, changes.length) : changes.length;
  return { error: 'visibility', changes, total };
}

/** The confirm dialog's heading. */
export function refusalHeading(refusal: TreeVisibilityRefusal): string {
  const n = refusal.total;
  return `This changes who can see ${n === 1 ? 'one item' : `${n} items`}`;
}

/** Who a share reaches, inside a sentence ("Share it with the team."). */
export const SHARE_WHO: Record<TreeShareLevel, string> = {
  team: 'the team',
  client: 'clients',
};
