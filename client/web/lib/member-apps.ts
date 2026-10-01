import type { HubData, HubNavTarget } from '@mantle/share-ui/app-bridge-protocol';
import type { MemberHomeData as ContractHomeData } from '@mantle/client-types';
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import type { MemberAppCard, MemberAppList } from '@mantle/client-types';
import { launcherLevel, type AppLauncherFolder, type LauncherLevel } from './app-launcher';

/**
 * Apps for members (member logins Phase 4b). A member RUNS team-level apps
 * over the brain's member routes (/api/member/apps/*): published build only,
 * run-only tool and db brokers. Members never create, edit or share an app,
 * so nothing here reaches an owner /api/apps route.
 *
 * The wire types come from the contract (@mantle/client-types, brains from
 * 0.232.289; a card's `dataReadOnly` from the C6 contract);
 * the hub payload is share-ui's HubData. The launcher's folders (brains from
 * 0.232.368) are read as a local optional type (./app-launcher.ts).
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

/** GET /api/member/apps as a brain may answer it: an older brain sends no
 *  `folders`, and the launcher is then one flat list, as before. */
export type MemberAppListWire = MemberAppList & { folders?: AppLauncherFolder[] | null };

/**
 * What the member launcher shows at `folderId` (null = the top level; null
 * back = no such folder, show the top level). The home app is left out, as
 * in the flat list, so a folder that held it alone is not an empty tile.
 * The rules are `launcherLevel`'s (./app-launcher.ts).
 */
export function memberLauncherLevel(
  list: MemberAppListWire,
  folderId: string | null,
): LauncherLevel<MemberAppCard> | null {
  return launcherLevel({ apps: launcherApps(list), folders: list.folders }, folderId);
}

/** Where the launcher shows a folder (null = the top level). */
export function memberAppsHref(folderId: string | null): string {
  return folderId ? `/apps?folder=${encodeURIComponent(folderId)}` : '/apps';
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
