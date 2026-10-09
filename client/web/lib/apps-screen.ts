/**
 * The admin's /apps screen on the item tree (2026-10-09): the URL rules and
 * the copy it shares with its tests. Pure, so the rules are testable without
 * a DOM.
 *
 * /apps is the same folder view as Pages, Notes, Tables, Draw and Files: the
 * tree in the list column (search in `?q=`), the picked app in `?id=`, and
 * the app's own screen at /apps/<id> (Builder, Code, History, Activity and
 * the switches).
 */

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

/** The hint beside the level control: what Team means for an app. */
export const APP_SHARE_HINT =
  'At Team, members can use the app’s Mantle tools and write to its data, and every action is audited to that member. A public link can only read the app’s own data.';
