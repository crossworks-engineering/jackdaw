/**
 * A client's apps (client logins C6), the pure half: the apps an admin set to
 * CLIENT level and published, which a client runs over the client routes
 * (/api/client/apps/*: the published build only, the run-only tool and db
 * brokers). A client never creates, edits or shares an app, and never runs a
 * team, admin or public one (decision 3): the brain lists only what it may.
 *
 * The screen is the portal's third, `?view=apps` (`&id=` the app running,
 * `&folder=` a folder of the admin's Apps folders open, read only), beside
 * "Shared with you" and My requests. A brain before C6 has no such
 * route (404): no Apps in the rail, and nothing asks it again in this page
 * load (askUnlessMissing).
 *
 * No React here, so every rule is pinned by a test (client-apps.test.ts).
 */
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import { CLIENT_VIEW_HREF } from './client-requests';
import type { ClientAppCard, ClientAppList } from '@mantle/client-types';
import {
  flatLauncherLevel,
  launcherLevel,
  type AppLauncherFolder,
  type LauncherLevel,
} from './app-launcher';

export type { ClientAppCard, ClientAppList };

/** GET /api/client/apps as a brain may answer it: `folders` (the admin's
 *  Apps folders that lead to one of these apps, brains from 0.232.368) is
 *  absent from an older brain, and the launcher is then one flat list. */
export type ClientAppListWire = ClientAppList & { folders?: AppLauncherFolder[] | null };

/** The list route: what a 404 marks missing. */
export const CLIENT_APPS_ROUTE = '/api/client/apps';

/** The list, shared by the rail (whether to show Apps) and the screen. */
export const CLIENT_APPS_KEY = ['client-apps'] as const;

/** One app's API base: the member routes' suffixes (frame-ticket, frame,
 *  tool-broker, db-broker) under the client prefix. */
export function clientAppBase(appId: string): string {
  return `${CLIENT_APPS_ROUTE}/${encodeURIComponent(appId)}`;
}

/** The `apiBase` + `fetcher` a client's AppSandbox needs: the client routes,
 *  on the brain's origin, with the client's credential (`withAuth`: the
 *  session cookie; a client signs in on the brain's own origin only). The
 *  frame itself authenticates by its ticket. */
export function clientAppSandboxProps(appId: string): {
  apiBase: string;
  fetcher: (input: string, init?: RequestInit) => Promise<Response>;
} {
  return {
    apiBase: apiUrl(clientAppBase(appId)),
    fetcher: (input, init) => fetch(input, withAuth(init)),
  };
}

/** Where a client's app opens: the portal's one path, the Apps screen. */
export function clientAppHref(appId: string): string {
  return `${CLIENT_VIEW_HREF.apps}&id=${encodeURIComponent(appId)}`;
}

/** Where the Apps screen shows a folder (null = the top level). */
export function clientAppsHref(folderId: string | null): string {
  return folderId
    ? `${CLIENT_VIEW_HREF.apps}&folder=${encodeURIComponent(folderId)}`
    : CLIENT_VIEW_HREF.apps;
}

/** Does the rail show Apps: only for a brain that answered with at least
 *  one app. Not while asking, not for a brain before C6 (404), not for an
 *  empty list. */
export function showsClientApps(list: ClientAppList | null | undefined): boolean {
  return !!list && Array.isArray(list.apps) && list.apps.length > 0;
}

/** The app a URL names, from the list (ids compared as the brain writes
 *  them, lower case). Null: not an app this client may run. */
export function findClientApp(
  list: ClientAppList | null | undefined,
  id: string | null,
): ClientAppCard | null {
  if (!list || !id) return null;
  const want = id.toLowerCase();
  return list.apps.find((a) => a.id === want) ?? null;
}

/** The launcher's search: the title or the description holds every word. */
export function filterClientApps(apps: readonly ClientAppCard[], q: string): ClientAppCard[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...apps];
  return apps.filter((a) => {
    const text = `${a.title} ${a.description ?? ''}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/**
 * What the client launcher shows, read only. A search is a question about
 * apps, not about where they sit: the matching apps, flat, from every
 * folder. Without one, the folder at `folderId` (null = the top level) by
 * the launcher's rules (./app-launcher.ts); a folder that is gone, or was
 * never the client's to see, is the top level.
 */
export function clientLauncherLevel(
  list: ClientAppListWire,
  folderId: string | null,
  q: string,
): LauncherLevel<ClientAppCard> {
  if (q.trim()) return flatLauncherLevel(filterClientApps(list.apps, q));
  return launcherLevel(list, folderId) ?? launcherLevel(list, null) ?? flatLauncherLevel(list.apps);
}

/** What the launcher says with no cards. */
export function clientAppsEmpty(q: string): string {
  return q.trim() ? 'No app matches that.' : 'No apps have been shared with you yet.';
}

/** What the Apps screen says on a brain before C6. */
export const CLIENT_APPS_UNAVAILABLE = 'Apps are not available here yet.';

/** What a client sees when their app reports a problem. The sandbox speaks to
 *  builders; a client can only try again, and never reads a staff role
 *  (audit U3). An expired session means signing in again. */
export function clientAppProblem(message: string): { signIn: true } | { text: string } {
  if (/frame ticket failed \(401\)/.test(message)) return { signIn: true };
  if (/tried to use the tool/i.test(message)) {
    return { text: 'This app needs something that is not available to you.' };
  }
  return { text: 'This app hit a problem. Try again later.' };
}
