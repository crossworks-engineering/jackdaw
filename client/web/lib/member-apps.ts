import type { HubData, HubNavTarget } from '@mantle/share-ui/app-bridge-protocol';
import type { MemberHomeData as ContractHomeData } from './contract/member-apps';
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';
import type { MemberAppCard, MemberAppList } from './contract/member-apps';

/**
 * Apps for members (member logins Phase 4b). A member RUNS the apps its
 * workspaces hold over the brain's member routes (/api/member/apps/*, kept in
 * W6b): published build only, run-only tool and db brokers. It finds, makes,
 * deletes and shares them on the one Apps screen (the owner routes, in its
 * scope) and changes their code over its own MCP connection.
 *
 * The wire types are lib/contract/member-apps.ts (a copy of the brain's
 * W5c contract: a card carries no level); the hub payload is share-ui's
 * HubData.
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
 *  chat dock, go to a real section (a team page, on Pages) or a real
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
  return { kind: 'href', href: `/pages/${encodeURIComponent(section.token)}` };
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
