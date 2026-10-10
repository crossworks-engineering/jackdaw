/**
 * The admin's /apps screen on the item tree (2026-10-09): the URL rules and
 * the copy it shares with its tests. Pure, so the rules are testable without
 * a DOM.
 *
 * /apps is the same folder view as Pages, Notes, Tables, Draw and Files: the
 * tree in the list column (search in `?q=`), the picked app in `?id=`, and
 * the app's own screen at /apps/<id> (Builder, Code, History, Activity and
 * the switches). A member's app (waiting for approval, or shared by members)
 * opens in the same pane, in `?review=`.
 */
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { AppDetail } from '@mantle/client-types';

/**
 * One app as its own screen reads it (GET /api/apps/:id), cached at
 * `['apps', id]` as the route answers it: `{ app }`. Every screen that reads
 * one app goes through this, so the cache entry has one shape. The /apps pane
 * once cached the bare app under the same key, and opening the app's own
 * screen from there read `data.app` as undefined and crashed.
 */
export const appDetailKey = (id: string) => ['apps', id] as const;
export function appDetailQuery(id: string) {
  return {
    queryKey: appDetailKey(id),
    queryFn: () => apiFetch<{ app: AppDetail }>(`/api/apps/${encodeURIComponent(id)}`),
    retry: false as const,
  };
}

/** What the /apps pane shows: a brain app, or a member's app to review. */
export type AppsSelection = { kind: 'app' | 'review'; id: string };

/** The URL params a selection writes (the other one cleared). */
export function selectionParams(sel: AppsSelection | null): {
  id: string | null;
  review: string | null;
} {
  return {
    id: sel?.kind === 'app' ? sel.id : null,
    review: sel?.kind === 'review' ? sel.id : null,
  };
}

/** The selection the URL opens: `?review=` wins over `?id=`. */
export function appsUrlSelection(params: Pick<URLSearchParams, 'get'>): AppsSelection | null {
  const review = params.get('review')?.trim();
  if (review) return { kind: 'review', id: review };
  const id = appsUrlId(params);
  return id ? { kind: 'app', id } : null;
}

/** Params the old /apps screens wrote that this one does not read: the paged
 *  list's `sort`, and its `page` once the tree is the list. */
const LEGACY_ALWAYS = ['sort'] as const;
const LEGACY_IN_TREE = ['page'] as const;

/**
 * Where an old /apps link lands: the same screen with the params it no longer
 * reads dropped, and `?selected=<id>` (the other workspaces' deep link) read
 * as `?id=`. Null when the URL is already current. `tree`: whether the list
 * is the item tree (a brain that serves it) rather than the paged list.
 */
export function appsLegacyHref(
  params: Pick<URLSearchParams, 'get' | 'has' | 'toString'>,
  tree: boolean,
): string | null {
  const drop: string[] = [...LEGACY_ALWAYS, ...(tree ? LEGACY_IN_TREE : [])];
  const selected = params.get('selected');
  if (!drop.some((k) => params.has(k)) && selected === null) return null;
  const next = new URLSearchParams(params.toString());
  for (const k of drop) next.delete(k);
  next.delete('selected');
  if (selected && !next.get('id')) next.set('id', selected);
  const qs = next.toString();
  return qs ? `/apps?${qs}` : '/apps';
}

/** The app the URL opens: `?id=`, else an old `?selected=`. */
export function appsUrlId(params: Pick<URLSearchParams, 'get'>): string | null {
  return params.get('id')?.trim() || params.get('selected')?.trim() || null;
}

/** Delete moves an app to the brain's trash (GET /api/apps/deleted), its
 *  code and data kept as a snapshot. */
export const APP_DELETE_CONFIRM =
  'It moves to the trash: restore it under Recently deleted apps for 30 days, with its code and data. No one can run it until then.';
export const APP_DELETED_TOAST =
  'Moved to the trash. Restore it under Recently deleted apps for 30 days.';

/** The hint under the Access panel: what a workspace grant means for an app. */
export const APP_SHARE_HINT =
  'Users in a workspace it is shared with can run the app and use its Mantle tools. With Write on, they also change its data. Every action is audited to that user. An open link can only read the app’s own data.';
