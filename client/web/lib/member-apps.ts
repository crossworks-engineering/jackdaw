import type { HubData, HubNavTarget } from '@mantle/share-ui/app-bridge-protocol';
import type { MemberHomeData as ContractHomeData } from '@mantle/client-types';
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import type { MemberAppCard, MemberAppList } from '@mantle/client-types';
import type { AppTint } from '@mantle/client-types/app-nav';

/**
 * Apps for members (member logins Phase 4b). A member RUNS team-level apps
 * over the brain's member routes (/api/member/apps/*): published build only,
 * run-only tool and db brokers. Members never create, edit or share an app,
 * so nothing here reaches an owner /api/apps route.
 *
 * The wire types come from the contract (@mantle/client-types, brains from
 * 0.232.289; a card's `dataReadOnly` from the C6 contract);
 * the hub payload is share-ui's HubData. The launcher's folders (brains from
 * 0.232.368) are read as a local optional type below.
 */

export type { MemberAppCard, MemberAppList };

/** GET /api/member/home with the hub typed as the app bridge's HubData. */
export type MemberHomeData = ContractHomeData<HubData>;

/** The `apiBase` + `fetcher` a member's AppSandbox needs: the member routes,
 *  on the brain's origin, with the member's credential (`withAuth`: the
 *  cookie same-origin, the member's bearer on a split client). The frame
 *  itself authenticates by its ticket. */
export function memberAppSandboxProps(appId: string): {
  apiBase: string;
  fetcher: (input: string, init?: RequestInit) => Promise<Response>;
} {
  return {
    apiBase: apiUrl(`/api/member/apps/${appId}`),
    fetcher: (input, init) => fetch(input, withAuth(init)),
  };
}

/** Where a member's app opens. */
export function memberAppHref(appId: string): string {
  return `/apps/${appId}`;
}

/** What the member shell does with a home app's `hub.nav` intent: open the
 *  chat dock, go to a real section (a team page, in the Library) or a real
 *  launcher app, or nothing. Never a token the payload did not list: an app
 *  bundle must not steer the shell anywhere else. */
export function memberHubNav(
  hub: Pick<HubData, 'sections' | 'apps'>,
  target: HubNavTarget,
): { kind: 'chat' } | { kind: 'href'; href: string } | null {
  if (target === 'chat') return { kind: 'chat' };
  if ('app' in target) {
    const app = (hub.apps ?? []).find((a) => a.token === target.app);
    return app ? { kind: 'href', href: memberAppHref(app.token) } : null;
  }
  const section = hub.sections.find((s) => s.token === target.briefing);
  if (!section) return null;
  const sp = new URLSearchParams({ id: section.token, src: 'library' });
  return { kind: 'href', href: `/pages?${sp.toString()}` };
}

/** The launcher's apps: every app the member may run except the home app,
 *  which lives on the home page (it needs the home's hub data). */
export function launcherApps(list: MemberAppList): MemberAppCard[] {
  return list.apps.filter((a) => a.id !== list.homeAppId);
}

// ── The launcher's folders (read only) ─────────────────────────────────────

/**
 * One folder of the admin's Apps folders as the brain answers it to a member
 * (`folders` on GET /api/member/apps, brains from 0.232.368): only folders
 * that lead to an app of the same answer. Declared here, optional, because
 * the pinned contract package is older than the field.
 */
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

/** GET /api/member/apps as a brain may answer it: an older brain sends no
 *  `folders`, and the launcher is then one flat list, as before. */
export type MemberAppListWire = MemberAppList & { folders?: AppLauncherFolder[] | null };

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
export type LauncherLevel = {
  folder: LauncherFolder | null;
  crumbs: LauncherFolder[];
  folders: LauncherFolder[];
  apps: MemberAppCard[];
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
 *  - the home app is left out, as in the flat list;
 *  - a folder shows only while it leads to an app the launcher shows, so a
 *    folder that held the home app alone is not an empty tile;
 *  - an app no folder names is at the top level, next to the folders;
 *  - no `folders` (an older brain) is every app at the top level;
 *  - folders keep the brain's order (the admin's), apps the list's (title).
 */
export function launcherLevel(
  list: MemberAppListWire,
  folderId: string | null,
): LauncherLevel | null {
  const apps = launcherApps(list);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const raw = Array.isArray(list.folders) ? list.folders.filter(isLauncherFolder) : [];
  const byId = new Map(raw.map((f) => [f.id, f]));

  // An app sits in one place: the first folder that names it.
  const placed = new Set<string>();
  const direct = new Map<string, MemberAppCard[]>();
  for (const f of raw) {
    const mine: MemberAppCard[] = [];
    for (const id of f.appIds) {
      const app = appById.get(id);
      if (!app || placed.has(id)) continue;
      placed.add(id);
      mine.push(app);
    }
    direct.set(f.id, mine);
  }

  // A parent the answer does not hold, or a loop of parents, is the top
  // level: nothing the member may run is ever hidden by a bad shape.
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

/** Where the launcher shows a folder (null = the top level). */
export function memberAppsHref(folderId: string | null): string {
  return folderId ? `/apps?folder=${encodeURIComponent(folderId)}` : '/apps';
}

/** "1 app", "3 apps": what a folder tile says it leads to. */
export function appCountLabel(n: number): string {
  return n === 1 ? '1 app' : `${n} apps`;
}

/** What a member sees when their app reports a problem. The sandbox speaks
 *  to builders ("add it with app_tools_set"); a member can only tell an
 *  admin, and an expired session means signing in again. */
export function memberAppProblem(message: string): { signIn: true } | { text: string } {
  if (/frame ticket failed \(401\)/.test(message)) return { signIn: true };
  if (/tried to use the tool/i.test(message)) {
    return { text: 'This app needs something team members cannot use. Tell an admin.' };
  }
  return { text: 'This app hit a problem. Try again, or tell an admin.' };
}
