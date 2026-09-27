import type { HubData, HubNavTarget } from '@mantle/share-ui/app-bridge-protocol';
import type { AppTint } from '@mantle/client-types/app-nav';
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';

/**
 * Apps for members (member logins Phase 4b). A member RUNS team-level apps
 * over the brain's member routes (/api/member/apps/*): published build only,
 * run-only tool and db brokers. Members never create, edit or share an app,
 * so nothing here reaches an owner /api/apps route.
 *
 * Types hand-copied from mantle @mantle/content member-apps.ts and
 * app/api/member/{apps,home}/route.ts (like lib/member-space.ts).
 */

/** One launcher card (GET /api/member/apps). */
export type MemberAppCard = {
  id: string;
  title: string;
  icon: string | null;
  color: AppTint | null;
  description: string | null;
  audience: 'team' | 'client' | 'public';
  updatedAt: string;
};

export type MemberAppList = { apps: MemberAppCard[]; homeAppId: string | null };

/** GET /api/member/home: the pinned home app (null = the built-in home) and
 *  what its `host.hub.get()` answers. A section's token is a page id; an app
 *  card's token is an app id. */
export type MemberHomeData = {
  homeApp: { appId: string; title: string } | null;
  hub: HubData;
};

/** The `apiBase` + `fetcher` a member's AppSandbox needs: the member routes,
 *  on the brain's origin, with the member's credential (the cookie; members
 *  hold no bearer). The frame itself authenticates by its ticket. */
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
