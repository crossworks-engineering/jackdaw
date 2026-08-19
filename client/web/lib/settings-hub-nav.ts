import { SlidersHorizontal } from 'lucide-react';
import type { NavGroup, NavItem } from '@mantle/web-ui/layout/nav-items';

/**
 * Collapse the thirteen single-panel Settings entries into one "Settings" row
 * pointing at the hub, for the SIDEBAR only.
 *
 * ── Why this lives in jackdaw ──────────────────────────────────────────────
 * `NAV_GROUPS` is defined in `@crossworks/share-ui`, built in the mantle repo,
 * so the list itself cannot be edited from here — see
 * `docs/handover-settings-nav-mantle.md`. This is the consumer doing the
 * collapse at render instead, which the sidebar already does for other reasons
 * (it injects the live Pending badge the same way).
 *
 * Two things fall out of doing it here rather than there, and both are wins:
 *
 * - **`ALL_NAV_ITEMS` is untouched**, so ⌘K still finds "Backups" and "Audit
 *   log" by name and `matchNavItem` still attributes usage to them. Deleting
 *   the items in mantle would have taken both away; that is finding §3b of the
 *   handover, and this route avoids it entirely.
 * - It is **reversible in one file**. When mantle collapses the list properly,
 *   delete this module and its two call sites.
 *
 * ⚠ IDEMPOTENT ON PURPOSE. When the mantle change does land, the hub screens
 * will already be absent and a "Settings" row already present — so this must
 * not add a second one. It filters by href and inserts only if missing.
 */

/** The thirteen the hub lists. Twelve live in the Settings group; `discover`
 *  sits in REVIEW (beside Team and Pending) and deliberately stays there — its
 *  hub card is a second door, not a replacement. */
const HUB_HREFS = new Set([
  '/settings/profile',
  '/settings/appearance',
  '/settings/microsoft',
  '/settings/calendar',
  '/settings/mcp',
  '/settings/embedding',
  '/settings/network',
  '/settings/entities',
  '/settings/pdf-passwords',
  '/settings/backups',
  '/settings/updates',
  '/settings/audit',
]);

export const SETTINGS_HUB_HREF = '/settings';

const HUB_ITEM: NavItem = {
  name: 'Settings',
  href: SETTINGS_HUB_HREF,
  icon: SlidersHorizontal,
};

/** Cold-start head for the collapsed group: the hub first, then the collection
 *  screens a new brain actually sets up. The old list named Profile and
 *  Appearance, which are inside the hub now — and `defaultHead` is matched by
 *  href, so a stale entry is silently inert rather than an error. */
const COLLAPSED_DEFAULT_HEAD = [
  SETTINGS_HUB_HREF,
  '/settings/accounts',
  '/settings/agents',
  '/settings/keys',
  '/settings/tools',
];

export function collapseSettingsNav<G extends NavGroup>(groups: G[]): G[] {
  return groups.map((group) => {
    const kept = group.items.filter((item) => !HUB_HREFS.has(item.href));
    const removedAny = kept.length !== group.items.length;
    const hasHub = kept.some((item) => item.href === SETTINGS_HUB_HREF);

    // The hub row goes in the group we actually COLLAPSED — not in "any group
    // holding a /settings/ href", which is a trap: `discover` lives under
    // `/settings/discover` but sits in the REVIEW group, so that test put a
    // second "Settings" row at the top of Review.
    if (!removedAny) return group;

    return {
      ...group,
      items: hasHub ? kept : [HUB_ITEM as G['items'][number], ...kept],
      defaultHead: COLLAPSED_DEFAULT_HEAD,
    };
  });
}

/**
 * The one visible item a pathname belongs to — the longest matching href wins.
 *
 * The sidebar used to ask `navItemMatches` per item, independently, which was
 * fine while no entry was a prefix of another. "Settings" at `/settings` is a
 * prefix of every other settings route, so that test would light it alongside
 * Agents on `/settings/agents`. Most-specific-wins is what `matchNavItem`
 * already does for usage attribution; this is the same rule over the items the
 * sidebar is actually showing — which matters, because `/settings/profile` has
 * no entry of its own any more and must fall through to the hub.
 */
export function activeNavHref(groups: NavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const matches = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + '/');
      if (matches && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
