/**
 * A member's ONE list of a kind (item-list alignment, P4): everything the
 * member may see, newest first, each row wearing its state pill. The brain
 * merges the sources (GET /api/member/items, mantle 0.232.334); this module
 * builds the request, maps a row to the URL's `src` (which item view opens
 * it), and, on a brain older than the route, falls back to merging the four
 * old source lists here.
 */
import { ApiError, apiFetch } from '@mantle/web-ui/api-fetch';
import type {
  MemberAcceptedPage,
  MemberItemFilter,
  MemberItemPill,
  MemberItemRow,
  MemberItemSource,
  MemberItemsPage,
  MemberLibraryPage,
  MemberSpaceItemRow,
  MemberSpaceList,
} from '@mantle/client-types';
import { listPath, type SpaceKind, type SpaceSource } from './member-space';

/** The State filter's choices, the first the default. */
export const MEMBER_STATE_OPTIONS: readonly { value: MemberItemFilter; label: string }[] = [
  { value: 'all', label: 'All items' },
  { value: 'private', label: 'Private' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'returned', label: 'Returned' },
  { value: 'with-admin', label: 'With admin' },
  { value: 'brain', label: 'Brain' },
  { value: 'by-me', label: 'By me' },
];

export function memberStateOf(params: Pick<URLSearchParams, 'get'> | null): MemberItemFilter {
  const v = params?.get('state');
  return MEMBER_STATE_OPTIONS.some((o) => o.value === v) ? (v as MemberItemFilter) : 'all';
}

export function memberItemsPath(opts: {
  kind: SpaceKind;
  q?: string;
  state?: MemberItemFilter;
  page?: number;
}): string {
  const sp = new URLSearchParams({ kind: opts.kind });
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  if (opts.state && opts.state !== 'all') sp.set('state', opts.state);
  if (opts.page && opts.page > 1) sp.set('page', String(opts.page));
  return `/api/member/items?${sp.toString()}`;
}

/** The URL's `src` for a row (the old source names, which links still use). */
export function srcOf(source: MemberItemSource): SpaceSource {
  return source === 'own' ? 'mine' : source;
}

/** The pill of an own or teammate's row, as the brain gives it (pillOf). */
export function pillOfSpaceRow(
  row: Pick<MemberSpaceItemRow, 'sharing' | 'reviewState'>,
): MemberItemPill | null {
  switch (row.reviewState) {
    case 'with-admin':
    case 'taken':
      return 'with-admin';
    case 'submitted':
      return 'submitted';
    case 'returned':
      return 'returned';
    case 'accepted':
      return null;
    default:
      return row.sharing === 'team' ? 'draft' : 'private';
  }
}

const spaceRow = (r: MemberSpaceItemRow, source: 'own' | 'team'): MemberItemRow => ({
  id: r.id,
  type: r.type,
  title: r.title,
  icon: r.icon,
  summary: null,
  updatedAt: r.updatedAt,
  source,
  pill: pillOfSpaceRow(r),
  audience: null,
  author: null,
  byMe: false,
  space: r,
});

/** Does a row pass the State filter? Only the fallback needs this: the
 *  brain filters in each source's own query. */
export function passesState(row: MemberItemRow, state: MemberItemFilter): boolean {
  switch (state) {
    case 'all':
      return true;
    case 'brain':
      return row.pill === null;
    case 'by-me':
      return row.byMe;
    default:
      return row.pill === state;
  }
}

/**
 * The fallback for a brain older than /api/member/items: page 1 of each old
 * source list (50 rows each), merged newest first and filtered here. Good
 * enough to show everything on a small team while a box catches up; the
 * brain's own merge pages exactly.
 */
export async function legacyMemberItems(opts: {
  kind: SpaceKind;
  q?: string;
  state: MemberItemFilter;
}): Promise<MemberItemsPage> {
  const q = { kind: opts.kind, q: opts.q, page: 1 };
  const [mine, team, library, accepted] = await Promise.all([
    apiFetch<MemberSpaceList>(listPath('mine', q)),
    apiFetch<MemberSpaceList>(listPath('team', q)).catch(() => null),
    apiFetch<MemberLibraryPage>(listPath('library', q)).catch(() => null),
    apiFetch<MemberAcceptedPage>(listPath('accepted', q)).catch(() => null),
  ]);
  const inLibrary = new Set(library?.items.map((r) => r.id) ?? []);
  const rows: MemberItemRow[] = [
    ...mine.items.map((r) => spaceRow(r, 'own')),
    ...(team?.items ?? []).map((r) => spaceRow(r, 'team')),
    ...(library?.items ?? []).map((r): MemberItemRow => ({
      id: r.id,
      type: r.type,
      title: r.title,
      icon: r.icon,
      summary: r.summary,
      updatedAt: r.updatedAt,
      source: 'library',
      pill: null,
      audience: r.audience,
      author: r.author ?? null,
      byMe: false,
      space: null,
    })),
    ...(accepted?.items ?? [])
      .filter((r) => !inLibrary.has(r.id))
      .map((r): MemberItemRow => ({
        id: r.id,
        type: r.type,
        title: r.title,
        icon: r.icon,
        summary: null,
        updatedAt: r.updatedAt,
        source: 'accepted',
        pill: null,
        audience: r.audience,
        author: null,
        byMe: true,
        space: null,
      })),
  ]
    .filter((r) => passesState(r, opts.state))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return { items: rows, total: rows.length, page: 1, pageSize: Math.max(rows.length, 50) };
}

/** The one list: the brain's merge, or the fallback on an older brain (the
 *  route is unknown there: 404, or the member gate's 403). */
export async function fetchMemberItems(opts: {
  kind: SpaceKind;
  q?: string;
  state: MemberItemFilter;
  page: number;
}): Promise<MemberItemsPage> {
  try {
    return await apiFetch<MemberItemsPage>(memberItemsPath(opts));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      return legacyMemberItems(opts);
    }
    throw err;
  }
}
