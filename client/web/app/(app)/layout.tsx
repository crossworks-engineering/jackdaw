import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/app-shell';
import {
  ACTIVITY_W_COOKIE,
  NAV_W_COOKIE,
  clampActivityWidth,
  clampNavWidth,
} from '@/lib/nav-width';
import { UsageCard } from '@/components/usage-card';
import type { SpendRange } from '@mantle/client-types';
import { MEMBER_HINT_COOKIE } from '@/lib/member-surface';
import { CLIENT_HINT_COOKIE } from '@/lib/client-surface';
import { loadBrainAppearance } from '@/lib/appearance';
import { clientTabTitle, readBrandFields } from '@/lib/brand';

/**
 * App shell: the rail on the left (brand, account, search, nav, launchers),
 * live-activity column on the right, content in the middle running the full
 * height of the window. No header, no footer bar — see components/app-shell.
 *
 * ZERO-SECRET variant — this app cannot verify a session (no SESSION_SECRET,
 * no DB), so there is NO server-side auth or onboarding gate here. This is
 * the detached-dev branch of the old monolith layout made permanent:
 *   - auth UX     → client middleware (presence cookie → /login redirect)
 *   - enforcement → the server origin's 401s on every data fetch (apiFetch
 *                   bounces to /login and clears the token store)
 *   - onboarding  → AppShell's client redirect off GET /api/shell
 *   - UsageCard   → a client component fetching GET /api/metrics/usage (it
 *                   used to read the DB in-process, which is what the carve
 *                   took away)
 *
 * The cookies read here are pure request-state UX (flash-free first paint) —
 * reading them needs no secret. The spend range is one of them: the card owns
 * the range after mount, but seeding it server-side stops the pills flicking
 * from 'day' to the user's choice on every load.
 */

/**
 * A client's tab (client logins audit B27): the site name, else the
 * product's, never the peer name the root layout falls back to (a box's
 * name is staff knowledge). Only when the client hint says this is a client;
 * the portal sets the same title once the brain confirms one
 * (components/client/client-portal.tsx).
 */
export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  if (cookieStore.get(CLIENT_HINT_COOKIE)?.value !== '1') return {};
  const fields = readBrandFields(await loadBrainAppearance());
  return { title: { absolute: clientTabTitle(fields) } };
}

const SPEND_RANGES: SpendRange[] = ['day', 'week', 'month'];

function readSpendRange(value: string | undefined): SpendRange {
  return (SPEND_RANGES as string[]).includes(value ?? '') ? (value as SpendRange) : 'day';
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const navCollapsed = cookieStore.get('mantle_nav_collapsed')?.value === '1';
  // Activity defaults to collapsed — only an explicit '0' (user expanded it) opens it.
  const activityCollapsed = cookieStore.get('mantle_activity_collapsed')?.value !== '0';
  const navWidth = clampNavWidth(cookieStore.get(NAV_W_COOKIE)?.value);
  const activityWidth = clampActivityWidth(cookieStore.get(ACTIVITY_W_COOKIE)?.value);
  const spendRange = readSpendRange(cookieStore.get('mantle_spend_range')?.value);
  // Member and client logins: a hint seeds the member shell, or the client
  // portal (client logins C2), for the first paint (no flash of owner chrome,
  // no owner request); the shell confirms it and reloads if wrong. The client
  // hint wins a (stale) member hint: the portal asks only client routes.
  // Without either the role is NOT known (client logins C0): never assumed to
  // be an admin. The shell shows a neutral screen until the brain confirms
  // one, and the usage card (like all owner chrome) mounts only for that admin.
  const role =
    cookieStore.get(CLIENT_HINT_COOKIE)?.value === '1'
      ? 'client'
      : cookieStore.get(MEMBER_HINT_COOKIE)?.value === '1'
        ? 'member'
        : null;

  return (
    <AppShell
      role={role}
      contextCard={<UsageCard initialRange={spendRange} />}
      initialNavCollapsed={navCollapsed}
      initialNavWidth={navWidth}
      initialActivityWidth={activityWidth}
      initialActivityCollapsed={activityCollapsed}
    >
      {children}
    </AppShell>
  );
}
