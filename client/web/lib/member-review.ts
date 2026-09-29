/**
 * Member review, the admin side (member logins Phase 4): the brain's
 * /api/team-admin/submissions routes. An admin sees exactly two kinds of
 * personal item there: one a member SUBMITTED for review, and one a
 * deactivated login left SHARED with the team. Never a private item; the
 * brain answers those with a plain 404, the same as an item that is no
 * longer waiting (recalled by its author, or handled by another admin).
 *
 * Types mirror the brain's member-review.ts; they move into the published
 * contract with the member-space types (lib/member-space.ts).
 */
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type { AccessItemView, AccessLevel, TakeOverResult } from '@mantle/client-types';
import { closureAbove, LEVEL_LABEL } from './access-levels';
import type {
  AcceptConfirmLevelRefusal,
  AcceptPreview,
  AcceptRequest,
  ReviewAuthorRole,
  ReviewAuthorView,
} from './contract-next';
import { MEMBER_KIND } from './member-kinds';
import {
  refusalReason,
  type SpaceComment,
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
  comments: SpaceComment[];
};

export type BundleItem = { id: string; type: SpaceKind; title: string };
export type Bundle = Pick<AcceptPreview, 'closure'> & {
  items: BundleItem[];
  linksStayingBehind: number;
};

export type AcceptInput = AcceptRequest & { audience: AccessLevel };

export type AcceptResult = {
  id: string;
  audience: AccessLevel;
  moved: BundleItem[];
  linksStayingBehind: number;
  levelWarning?: string;
};

const base = (id: string) => `/api/team-admin/submissions/${id}`;

export const QUEUE_KEY = ['team-admin', 'submissions'] as const;
export const itemKey = (id: string) => ['team-admin', 'submissions', id] as const;

export const memberReview = {
  queue: () => apiFetch<ReviewQueue>('/api/team-admin/submissions'),
  item: (id: string) => apiFetch<ReviewItem>(base(id)),
  bundle: (id: string) => apiFetch<Bundle>(`${base(id)}/bundle`),
  addComment: (id: string, body: string) =>
    apiSend<{ comment: SpaceComment }>(`${base(id)}/comments`, 'POST', { body }),
  deleteComment: (id: string, commentId: string) =>
    apiSend(`${base(id)}/comments/${commentId}`, 'DELETE'),
  accept: (id: string, input: AcceptInput) =>
    apiSend<AcceptResult>(`${base(id)}/accept`, 'POST', input),
  giveBack: (id: string, note: string) => apiSend(`${base(id)}/return`, 'POST', { note }),
  discard: (id: string) => apiSend(`${base(id)}/discard`, 'POST'),
  /** Into the acting admin's own private space, with its bundle (audit F07). */
  takeOver: (id: string) => apiSend<TakeOverResult>(`${base(id)}/take-over`, 'POST'),
};

/**
 * Can an admin take this queue item over? A submitted item can, and so can
 * one released back to the queue (its taker was deactivated). A left-behind
 * item its author never submitted cannot (the brain answers 409
 * `not-submitted`): accept it or discard it.
 */
export function canTakeOver(row: Pick<ReviewItemRow, 'reviewState'>): boolean {
  return row.reviewState === 'submitted' || row.reviewState === 'taken';
}

/** Released: an admin took it over and was deactivated since, so it came
 *  back to the queue with what was taken with it. */
export function isReleased(row: Pick<ReviewItemRow, 'reviewState'>): boolean {
  return row.reviewState === 'taken';
}

/** Review comments are open while the item waits as submitted; not on a
 *  released item (the brain answers 409 `not-submitted`). */
export function reviewCommentsOpen(row: Pick<ReviewItemRow, 'reason' | 'reviewState'>): boolean {
  return row.reason === 'submitted' && row.reviewState === 'submitted';
}

/** The sentence for a refused Take over. */
export function takeOverErrorMessage(err: unknown): string {
  const reason = refusalReason(err);
  if (reason === 'not-submitted') {
    return 'Only an item that was submitted for review can be taken over. Accept it or discard it instead.';
  }
  if (reason === 'too-large') {
    return 'This item shows too many others to take over at once (more than 200). Accept it or return it instead.';
  }
  return reviewErrorMessage(err, 'Could not take this item over.');
}

/** The item's own bytes, or a file in its bundle (an image a page shows). */
export const reviewBytesPath = (id: string, node = id) =>
  `${base(id)}/bytes${node === id ? '' : `?node=${node}`}`;
/** The item's saved SVG, or a drawing in its bundle. */
export const reviewSvgPath = (id: string, node = id) =>
  `${base(id)}/svg${node === id ? '' : `?node=${node}`}`;

const FILE_RE = /^\/api\/files\/files\/([0-9a-f-]{36})(\?[^#]*)?$/i;
const DRAW_RE = /^\/api\/draws\/([0-9a-f-]{36})\/svg(?:\?.*)?$/i;

/**
 * A submitted page's document still points at the brain's own asset routes
 * (`/api/files/files/<id>`, `/api/draws/<id>/svg`), which cannot see a
 * personal space. For the review, those map onto the submission's own byte
 * routes, which serve the item's bundle and nothing else. A thumbnail stays
 * a thumbnail. Anything else passes through unchanged.
 */
export function reviewAssetPath(submissionId: string, path: string): string {
  const file = FILE_RE.exec(path);
  if (file) {
    const node = file[1]!.toLowerCase();
    const qs = new URLSearchParams();
    if (node !== submissionId) qs.set('node', node);
    if (new URLSearchParams(file[2]?.slice(1) ?? '').get('thumb') === '1') qs.set('thumb', '1');
    const s = qs.toString();
    return `${base(submissionId)}/bytes${s ? `?${s}` : ''}`;
  }
  const draw = DRAW_RE.exec(path);
  if (draw) return reviewSvgPath(submissionId, draw[1]!.toLowerCase());
  return path;
}

/** The queue split for the list: waiting for review, then left behind. */
export function splitQueue(items: readonly ReviewItemRow[]): {
  submitted: ReviewItemRow[];
  leftBehind: ReviewItemRow[];
} {
  return {
    submitted: items.filter((i) => i.reason === 'submitted'),
    leftBehind: items.filter((i) => i.reason === 'left-behind'),
  };
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

/** The sentence for a refused review action. A 404 means the item is no
 *  longer waiting (the brain does not say why, on purpose). */
export function reviewErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'This item is not waiting for review any more. The author may have recalled it, or another admin handled it.';
    }
    if (err.message) return err.message;
  }
  return fallback;
}

/** The accept dialog's top-level choice for a page's parent. */
export const TOP_OF_PAGES = '__top__';

/**
 * The parent page an accept actually uses: the one picked while it is still
 * among the pages shown, else the top of Pages. A new search that hides the
 * picked page drops it, so the page never nests under a parent the admin can
 * no longer see.
 */
export function shownParent(picked: string, shownIds: readonly string[]): string {
  return picked !== TOP_OF_PAGES && shownIds.includes(picked) ? picked : TOP_OF_PAGES;
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
