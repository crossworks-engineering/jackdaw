/**
 * Removed in W5c: the review flow (the /api/team-admin/submissions queue,
 * Approve, Reject, Take over, Discard) is gone from the owner screens;
 * workspaces replace it. What stays here serves only files other W5c parts
 * still own:
 *
 *  - the queue's type and the saved-version asset paths: components/review/
 *    item-review.tsx (kept for Team admin and a member guard test);
 *  - the Accept types and rules: components/review/review-dialogs.tsx
 *    (AcceptIntoBrainDialog, for components/member/mine-item.tsx) and
 *    lib/member-space.ts;
 *  - authorRoleLabel: components/member/client-request-item.tsx;
 *  - bundleSummary: lib/member-kinds.test.ts.
 *
 * Delete this file when those go.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { AccessItemView, AccessLevel } from '@mantle/client-types';
import { closureAbove, LEVEL_LABEL } from './access-levels';
import type {
  AcceptConfirmLevelRefusal,
  AcceptPreview,
  AcceptRequest,
  ReviewAuthorRole,
  ReviewAuthorView,
} from '@mantle/client-types';
import { MEMBER_KIND } from './member-kinds';
import type {
  TreeCrumb,
  TreeKind,
  TreeShareLevel,
  TreeVisibilityChange,
  TreeVisibilityRefusal,
} from '@mantle/web-ui/types/tree';
import {
  type SpaceItemBody,
  type SpaceKind,
  type SpaceSharing,
  type ReviewState,
} from './member-space';

export type ReviewReason = 'submitted' | 'left-behind';

/** `inactive`: deactivated, or the login is gone. */
export type ReviewAuthor = ReviewAuthorView;

export type ReviewItemRow = {
  id: string;
  type: SpaceKind;
  title: string;
  icon: string | null;
  sharing: SpaceSharing;
  /** `taken`: an admin took it over and was deactivated since, so it is
   *  back in the queue ("released", audit F07). */
  reviewState: ReviewState;
  submittedAt: string | null;
  updatedAt: string;
  reason: ReviewReason;
  author: ReviewAuthor;
};

export type ReviewQueue = {
  items: ReviewItemRow[];
  counts: { submitted: number; leftBehind: number };
};

export type ReviewItem = {
  row: ReviewItemRow;
  body: SpaceItemBody;
};

export type BundleItem = { id: string; type: SpaceKind; title: string };
/** TEMPORARY contract shim until the pin bump: where an Accept lands by
 *  default (folder plan phase 5, AcceptPreview.place in the brain's
 *  @crossworks/client-types). */
export type AcceptPlace = {
  kind: TreeKind;
  /** The brain folder it goes in or under; null = the kind's top level. */
  folderId: string | null;
  /** That folder's crumbs, top-down, itself included. */
  crumbs: TreeCrumb[];
  /** The author's own folders that become brain folders below it. */
  creates: string[];
  /** The share it is read at there through a shared folder (null: none):
   *  the item is read at the more open of this and the chosen level. Absent
   *  from brains before the Accept visibility check. */
  share?: TreeShareLevel | null;
};

export type Bundle = Pick<AcceptPreview, 'closure'> & {
  items: BundleItem[];
  linksStayingBehind: number;
  /** Absent from brains before the tree (pages joined it in folder phase 7). */
  place?: AcceptPlace;
};

/** `folderId` (folder plan phase 5, shim): where the item lands; left out,
 *  in place; null, the kind's top level. `visibilityConfirmed` (shim, the
 *  brain's AcceptRequest): the admin saw the `visibility` refusal's list and
 *  accepts that those items are read above the chosen level where they land. */
export type AcceptInput = AcceptRequest & {
  audience: AccessLevel;
  folderId?: string | null;
  visibilityConfirmed?: boolean;
  /** The pin (shim until the pin bump, the brain's AcceptRequest): the
   *  `submittedAt` the admin was shown, null for a left-behind item never
   *  submitted. The brain requires it: missing, or the author sent it again
   *  since, is 409 `changed` (an older brain ignores it). */
  submittedAt?: string | null;
};

/** TEMPORARY contract shim until the pin bump (the brain's
 *  AcceptVisibilityRefusal): 409 from either Accept (brains with the Accept
 *  visibility check): the item, or something of its bundle, lands in a
 *  shared folder and would be read above the chosen level there. Nothing
 *  moved; repeat with `visibilityConfirmed: true`. */
export type AcceptVisibilityRefusal = {
  error: string;
  reason: 'visibility';
  /** The first changes (at most TREE_VISIBILITY_LIST_MAX): `from` the
   *  chosen level, `to` the level it would be read at. */
  changes: TreeVisibilityChange[];
  total: number;
  /** Brain items the bundle embeds that would be read through it at the
   *  folder's share (brains with 0208). */
  alsoEmbeds?: TreeVisibilityChange[];
};

export type AcceptResult = {
  id: string;
  audience: AccessLevel;
  /** The level the item is read at: the more open of `audience` and the
   *  share of the folder it landed in. Absent from brains before the Accept
   *  visibility check. */
  readAt?: AccessLevel;
  moved: BundleItem[];
  linksStayingBehind: number;
  levelWarning?: string;
  /** The moved items given a Team read grant (W5b2 contract 31): a team,
   *  client or public choice adds one, admin none. Absent from a brain
   *  before W5b2. */
  teamGranted?: string[];
};

const base = (id: string) => `/api/team-admin/submissions/${encodeURIComponent(id)}`;

/** The item's own bytes, or a file in its bundle (an image a page shows). */
export const reviewBytesPath = (id: string, node = id, root: (id: string) => string = base) =>
  `${root(id)}/bytes${node === id ? '' : `?node=${node}`}`;
/** The item's saved SVG, or a drawing in its bundle. */
export const reviewSvgPath = (id: string, node = id, root: (id: string) => string = base) =>
  `${root(id)}/svg${node === id ? '' : `?node=${node}`}`;

const FILE_RE = /^\/api\/files\/files\/([0-9a-f-]{36})(\?[^#]*)?$/i;
const DRAW_RE = /^\/api\/draws\/([0-9a-f-]{36})\/svg(?:\?.*)?$/i;

/**
 * A submitted page's document still points at the brain's own asset routes
 * (`/api/files/files/<id>`, `/api/draws/<id>/svg`), which cannot see a
 * personal space. For the review, those map onto the submission's own byte
 * routes, which serve the item's bundle and nothing else. A thumbnail stays
 * a thumbnail. Anything else passes through unchanged.
 */
export function reviewAssetPath(
  submissionId: string,
  path: string,
  /** The item's route root: the submission's, or a shared item's
   *  (sharedItemPath, lib/workspace-review.ts). */
  root: (id: string) => string = base,
): string {
  const file = FILE_RE.exec(path);
  if (file) {
    const node = file[1]!.toLowerCase();
    const qs = new URLSearchParams();
    if (node !== submissionId) qs.set('node', node);
    if (new URLSearchParams(file[2]?.slice(1) ?? '').get('thumb') === '1') qs.set('thumb', '1');
    const s = qs.toString();
    return `${root(submissionId)}/bytes${s ? `?${s}` : ''}`;
  }
  const draw = DRAW_RE.exec(path);
  if (draw) return reviewSvgPath(submissionId, draw[1]!.toLowerCase(), root);
  return path;
}

/** What the dialog says moves along, in words: "2 images, 1 drawing". */
export function bundleSummary(items: readonly BundleItem[]): string {
  const rest = items.slice(1);
  if (!rest.length) return 'Nothing else moves with it.';
  const counts = new Map<SpaceKind, number>();
  for (const i of rest) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  const parts = [...counts].map(
    ([k, n]) => `${n} ${n === 1 ? MEMBER_KIND[k].one : MEMBER_KIND[k].many}`,
  );
  return `Also moves ${parts.join(', ')}.`;
}

// ── A client's item at client or public (audit A28) ─────────────────────────

/** The author's role in words, for the badge (absent from older brains). */
export function authorRoleLabel(role: ReviewAuthorRole | null | undefined): string | null {
  return role === 'client' ? 'Client' : role === 'member' ? 'Member' : null;
}

/** Where the accept dialog's level starts: a client's item at Team (the
 *  brain's own default for it), anything else at Admin. */
export function defaultAcceptLevel(role: ReviewAuthorRole | null | undefined): AccessLevel {
  return role === 'client' ? 'team' : 'admin';
}

/** A client's item accepted at client or public goes to every client login
 *  (or everyone with the link), with what it embeds: the admin confirms it,
 *  item by item. A member's item is unchanged. */
export function needsLevelConfirm(
  role: ReviewAuthorRole | null | undefined,
  level: AccessLevel,
): boolean {
  return role === 'client' && (level === 'client' || level === 'public');
}

/** What goes DOWN with the item at `level`: the closure items above it. */
export function goingDownAt(
  closure: readonly AccessItemView[] | undefined,
  level: AccessLevel,
): AccessItemView[] {
  return closureAbove(closure ?? [], level);
}

/** The brain asked for a confirmation (409 `confirm-level`): its words and,
 *  from the audit-fix release on, the items that would go down. Null for any
 *  other failure. */
export function confirmLevelRefusal(
  err: unknown,
): { message: string; goingDown: AccessItemView[] | null } | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as Partial<AcceptConfirmLevelRefusal & { message: string }> | undefined;
  if (body?.reason !== 'confirm-level') return null;
  return {
    message: err.message || body.message || 'Confirm the level to accept this item.',
    goingDown: Array.isArray(body.goingDown) ? body.goingDown : null,
  };
}

/** The confirmation an accept sends: every item that goes down, each ticked.
 *  Null until all of them are (the Accept button waits for it). */
export function levelConfirmation(
  goingDown: readonly AccessItemView[],
  ticked: ReadonlySet<string>,
): Required<Pick<AcceptRequest, 'lowerConfirmed' | 'confirmedIds'>> | null {
  if (!goingDown.every((i) => ticked.has(i.id))) return null;
  return { lowerConfirmed: true, confirmedIds: goingDown.map((i) => i.id) };
}

/** The line over the list the admin ticks. `null`: a brain that sends no
 *  list, so the one tick is for the level and all it embeds. */
export function goingDownLine(level: AccessLevel, count: number | null): string {
  const who = level === 'public' ? 'anyone with the link' : 'every client login';
  if (count === null) {
    return `A client wrote this. At ${LEVEL_LABEL[level]}, ${who} reads it, with what it embeds. Tick to confirm.`;
  }
  if (count === 0) return `A client wrote this. At ${LEVEL_LABEL[level]}, ${who} reads it.`;
  return `A client wrote this. At ${LEVEL_LABEL[level]}, ${who} reads it, and ${count === 1 ? 'this item it embeds goes' : `these ${count} items it embeds go`} down with it. Tick each to confirm.`;
}

// ── Where it lands: a shared folder (folder plan phase 5) ───────────────────

/** Whether the preview's place is the one the admin picked: where it was
 *  filed when nothing is picked, else the picked folder (null = the top
 *  level). A brain before the pick preview answers the filed place whatever
 *  was picked, and so does the last answer while the new one loads. */
export function placeIsFor(
  place: Pick<AcceptPlace, 'folderId'>,
  pick: { id: string } | null | undefined,
): boolean {
  return pick === undefined || place.folderId === (pick?.id ?? null);
}

/** The line beside "Where it goes" for a folder that shares what it holds. */
export function placeShareLine(share: TreeShareLevel | null | undefined): string | null {
  if (share === 'client') return 'Clients read everything in this folder.';
  if (share === 'team') return 'The team reads everything in this folder.';
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

/** The brain's 409 `visibility` on an Accept (AcceptVisibilityRefusal): what
 *  would be read above the chosen level, in the tree's refusal shape so the
 *  tree's confirm dialog shows it. Null for any other failure. */
export function acceptVisibilityRefusal(err: unknown): TreeVisibilityRefusal | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as Partial<AcceptVisibilityRefusal> | undefined;
  if (body?.reason !== 'visibility' || !Array.isArray(body.changes)) return null;
  const changes = body.changes.filter(isChange);
  const total =
    typeof body.total === 'number' ? Math.max(body.total, changes.length) : changes.length;
  const alsoEmbeds = Array.isArray(body.alsoEmbeds) ? body.alsoEmbeds.filter(isChange) : [];
  return { error: 'visibility', changes, total, ...(alsoEmbeds.length ? { alsoEmbeds } : {}) };
}

/** The toast after an Accept: the level it is READ at, which a shared folder
 *  can open above the one chosen (a brain before it says only `audience`). */
export function acceptedLine(
  title: string,
  res: Pick<AcceptResult, 'audience' | 'readAt' | 'teamGranted'>,
): string {
  const name = `“${title || 'Untitled'}”`;
  // A W5b2 brain turns the choice into grants (contract 22 and 31): say
  // what Team gained, not a level.
  if (Array.isArray(res.teamGranted)) {
    const n = res.teamGranted.length;
    if (n === 0) return `Accepted ${name} into the brain.`;
    return `Accepted ${name} into the brain. Team can now read ${n === 1 ? 'it' : `${n} items from it`}.`;
  }
  const at = res.readAt ?? res.audience;
  if (at !== res.audience) {
    return `Accepted ${name} into the brain at ${LEVEL_LABEL[res.audience]}. Its folder shares it, so it is read at ${LEVEL_LABEL[at]}.`;
  }
  return `Accepted ${name} into the brain at ${LEVEL_LABEL[at]}.`;
}
