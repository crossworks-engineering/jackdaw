import type { AppNavEntry, AppNavItem, AppNavResponse } from '@mantle/web-ui/types/app-nav';

/**
 * Pure derivations the /apps list tree renders from one AppNavResponse. Kept out of
 * the component so the rules (what "unsorted" means, how search ranks, what
 * counts as recent) are testable without a DOM.
 */

/** Folder names from the root down to each placed app. */
export function folderPaths(entries: readonly AppNavEntry[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (list: readonly AppNavEntry[], path: string[]) => {
    for (const e of list) {
      if (e.kind === 'app') out.set(e.id, path);
      else walk(e.children, [...path, e.name]);
    }
  };
  walk(entries, []);
  return out;
}

/** Apps placed nowhere in the tree, newest first (where a new app lands). */
export function unsortedApps(data: AppNavResponse): AppNavItem[] {
  const placed = folderPaths(data.nav.entries);
  return data.apps
    .filter((a) => !placed.has(a.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type AppListMode = 'recent' | 'used' | 'az';

/**
 * The flat views. `recent` and `used` list only apps this login has opened:
 * padding them with never-opened apps would make "Recent" mean nothing.
 */
export function listApps(data: AppNavResponse, mode: AppListMode, tag?: string | null) {
  const apps = tag ? data.apps.filter((a) => a.tags.includes(tag)) : data.apps;
  if (mode === 'az') return [...apps].sort((a, b) => a.title.localeCompare(b.title));
  const opened = apps.filter((a) => data.opens[a.id]);
  if (mode === 'used') {
    return opened.sort(
      (a, b) =>
        data.opens[b.id]!.n - data.opens[a.id]!.n ||
        data.opens[b.id]!.at.localeCompare(data.opens[a.id]!.at),
    );
  }
  return opened.sort((a, b) => data.opens[b.id]!.at.localeCompare(data.opens[a.id]!.at));
}

export type AppHit = { app: AppNavItem; path: string[] };

/**
 * Apps matching a query on title, description, tags, or the names of the
 * folders they sit in (so typing a folder's name lists what's inside it).
 * Title hits rank first, then prefix-of-word hits, then the rest, each
 * alphabetical.
 */
export function searchApps(data: AppNavResponse, query: string): AppHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const paths = folderPaths(data.nav.entries);
  const scored: Array<AppHit & { score: number }> = [];
  for (const app of data.apps) {
    const path = paths.get(app.id) ?? [];
    const title = app.title.toLowerCase();
    let score = -1;
    if (title.startsWith(q)) score = 0;
    else if (title.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (title.includes(q)) score = 2;
    else if (path.some((f) => f.toLowerCase().includes(q))) score = 3;
    else if (app.tags.some((t) => t.toLowerCase().includes(q))) score = 4;
    else if (app.description?.toLowerCase().includes(q)) score = 5;
    if (score >= 0) scored.push({ app, path, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.app.title.localeCompare(b.app.title))
    .map(({ app, path }) => ({ app, path }));
}

/** Every tag in use, most common first. */
export function appTags(data: AppNavResponse): string[] {
  const counts = new Map<string, number>();
  for (const a of data.apps) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

/** How many apps a folder holds, all levels down. */
export function folderAppCount(entry: AppNavEntry): number {
  if (entry.kind === 'app') return 1;
  return entry.children.reduce((n, c) => n + folderAppCount(c), 0);
}
