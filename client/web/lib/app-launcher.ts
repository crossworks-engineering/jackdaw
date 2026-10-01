/**
 * The Apps launcher of a member or a client (read only), the pure half: the
 * admin's Apps folders as the brain answers them next to the apps a reader
 * may run (`folders` on GET /api/member/apps and /api/client/apps, brains
 * from 0.232.368), turned into one level to draw.
 *
 * The brain answers only folders that lead to an app of the same answer.
 * The type is declared here, optional on the lists, because the pinned
 * contract package is older than the field. No React, so every rule is
 * pinned by app-launcher.test.ts.
 */
import type { AppTint } from '@mantle/client-types/app-nav';

/** One folder as the brain answers it. */
export type AppLauncherFolder = {
  id: string;
  name: string;
  icon: string | null;
  color: AppTint | null;
  /** The folder it sits in, null at the top level. */
  parentId: string | null;
  /** The apps directly in it. */
  appIds: string[];
};

/** What a launcher is built from: the apps to show (in their order) and the
 *  folders, absent from an older brain. */
export type LauncherSource<T extends { id: string }> = {
  apps: readonly T[];
  folders?: readonly AppLauncherFolder[] | null;
};

/** A folder tile: its look, and how many apps it leads to (at any depth). */
export type LauncherFolder = {
  id: string;
  name: string;
  icon: string | null;
  color: AppTint | null;
  appCount: number;
};

/** One level of the launcher: the open folder (null = the top level), the
 *  folders above it top down, and what it holds. */
export type LauncherLevel<T> = {
  folder: LauncherFolder | null;
  crumbs: LauncherFolder[];
  folders: LauncherFolder[];
  apps: T[];
};

function isLauncherFolder(v: unknown): v is AppLauncherFolder {
  const f = v as Partial<AppLauncherFolder> | null;
  return !!f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.appIds);
}

/**
 * What the launcher shows at `folderId` (null = the top level). Null when
 * `folderId` names no folder the launcher shows (it went, or was never
 * there): the screen then shows the top level.
 *
 * The rules, kept here so the screen only draws:
 *  - a folder shows only while it leads to an app of `apps`, so a folder
 *    whose only app was left out (a member's home app) is not an empty tile;
 *  - an app no folder names is at the top level, next to the folders;
 *  - no `folders` (an older brain) is every app at the top level;
 *  - folders keep the brain's order (the admin's), apps the list's (title);
 *  - a bad shape never hides an app: a parent the answer does not hold and
 *    a loop of parents are the top level, an app named twice sits in the
 *    first folder that names it, and of two folders with one id the first
 *    counts (its apps and the second's are all kept, in the first).
 */
export function launcherLevel<T extends { id: string }>(
  source: LauncherSource<T>,
  folderId: string | null,
): LauncherLevel<T> | null {
  const apps = [...source.apps];
  const appById = new Map(apps.map((a) => [a.id, a]));

  // One folder per id: a second one with the same id folds into the first,
  // so its apps are not lost when the per-id maps below are filled.
  const byId = new Map<string, AppLauncherFolder>();
  for (const f of Array.isArray(source.folders) ? source.folders.filter(isLauncherFolder) : []) {
    const first = byId.get(f.id);
    if (first) byId.set(f.id, { ...first, appIds: [...first.appIds, ...f.appIds] });
    else byId.set(f.id, f);
  }
  const raw = [...byId.values()];

  // An app sits in one place: the first folder that names it.
  const placed = new Set<string>();
  const direct = new Map<string, T[]>();
  for (const f of raw) {
    const mine: T[] = [];
    for (const id of f.appIds) {
      const app = appById.get(id);
      if (!app || placed.has(id)) continue;
      placed.add(id);
      mine.push(app);
    }
    direct.set(f.id, mine);
  }

  // A parent the answer does not hold, or a loop of parents, is the top
  // level: nothing the reader may run is ever hidden by a bad shape.
  const parentOf = (f: AppLauncherFolder): string | null => {
    if (!f.parentId || !byId.has(f.parentId)) return null;
    let at: string | null = f.parentId;
    for (let i = 0; at && i <= raw.length; i++) {
      if (at === f.id) return null;
      const up: string | null = byId.get(at)?.parentId ?? null;
      at = up && byId.has(up) ? up : null;
    }
    return at ? null : f.parentId;
  };
  const children = new Map<string | null, AppLauncherFolder[]>();
  for (const f of raw) {
    const p = parentOf(f);
    children.set(p, [...(children.get(p) ?? []), f]);
  }
  const counts = new Map<string, number>();
  const countOf = (f: AppLauncherFolder): number => {
    const known = counts.get(f.id);
    if (known !== undefined) return known;
    const n =
      (direct.get(f.id)?.length ?? 0) +
      (children.get(f.id) ?? []).reduce((sum, c) => sum + countOf(c), 0);
    counts.set(f.id, n);
    return n;
  };
  const tile = (f: AppLauncherFolder): LauncherFolder => ({
    id: f.id,
    name: f.name,
    icon: f.icon ?? null,
    color: f.color ?? null,
    appCount: countOf(f),
  });
  const shown = (parent: string | null) =>
    (children.get(parent) ?? []).filter((f) => countOf(f) > 0).map(tile);

  if (folderId === null) {
    return {
      folder: null,
      crumbs: [],
      folders: shown(null),
      apps: apps.filter((a) => !placed.has(a.id)),
    };
  }
  const open = byId.get(folderId);
  if (!open || countOf(open) === 0) return null;
  const crumbs: LauncherFolder[] = [];
  for (let up = parentOf(open); up;) {
    const f: AppLauncherFolder = byId.get(up)!;
    crumbs.unshift(tile(f));
    up = parentOf(f);
  }
  return { folder: tile(open), crumbs, folders: shown(open.id), apps: direct.get(open.id) ?? [] };
}

/** A flat level: the apps with no folders (a search result). */
export function flatLauncherLevel<T>(apps: readonly T[]): LauncherLevel<T> {
  return { folder: null, crumbs: [], folders: [], apps: [...apps] };
}

/** "1 app", "3 apps": what a folder tile says it leads to. */
export function appCountLabel(n: number): string {
  return n === 1 ? '1 app' : `${n} apps`;
}
