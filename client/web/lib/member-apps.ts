import type { HubData, HubNavTarget } from '@mantle/share-ui/app-bridge-protocol';
import type { MemberHomeData as ContractHomeData } from './contract/member-apps';

/**
 * Apps for members (member logins Phase 4b). A member RUNS the apps its
 * workspaces hold on the app routes every login uses (W7e: the runner is
 * POST /api/apps/:id/frame-ticket, db-broker and tool-broker and GET
 * /api/apps/:id/frame, in the login's own scope; lib/owner-app-sandbox.ts).
 * It finds, makes, deletes and shares them on the one Apps screen and
 * changes their code over its own MCP connection. The member routes under
 * /api/member/apps are not called (lib/gone-routes.ts).
 *
 * The home payload is lib/contract/member-apps.ts; the hub is share-ui's
 * HubData.
 */

/** GET /api/member/home with the hub typed as the app bridge's HubData. */
export type MemberHomeData = ContractHomeData<HubData>;

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
