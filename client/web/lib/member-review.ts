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
import type { AccessLevel } from '@mantle/client-types';
import { MEMBER_KIND } from './member-kinds';
import type {
  SpaceComment,
  SpaceItemBody,
  SpaceKind,
  SpaceSharing,
  ReviewState,
} from './member-space';

export type ReviewReason = 'submitted' | 'left-behind';

export type ReviewAuthor = {
  loginId: string | null;
  name: string;
  email: string | null;
  /** Deactivated, or the login is gone. */
  inactive: boolean;
};

export type ReviewItemRow = {
  id: string;
  type: SpaceKind;
  title: string;
  icon: string | null;
  sharing: SpaceSharing;
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
export type Bundle = { items: BundleItem[]; linksStayingBehind: number };

export type AcceptInput = {
  audience: AccessLevel;
  parentPageId?: string | null;
  folderPath?: string | null;
};

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
};

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
