import {
  NAV_GROUPS as SHARED_NAV_GROUPS,
  navItemMatches,
  type NavGroup,
  type NavItem,
} from '@mantle/share-ui/nav-items';

export * from '@mantle/share-ui/nav-items';

/**
 * Screens the shared nav list still names but this client no longer has.
 * `/team-portal` was the owner's signpost to the team-code portal, retired in
 * member logins Phase 6; the list comes from @crossworks/share-ui (the mantle
 * repo), which still carries the row, so it is dropped here rather than
 * rendered as a link to a 404. Remove an entry once the shared list drops it.
 */
export const RETIRED_NAV_HREFS: ReadonlySet<string> = new Set(['/team-portal']);

/** Pure, so the filter is unit-tested against any list. A group left with no
 *  items goes too, and a retired href leaves a collapsible group's cold-start
 *  head as well. */
export function withoutRetired(groups: readonly NavGroup[]): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !RETIRED_NAV_HREFS.has(i.href)),
      ...(g.defaultHead
        ? { defaultHead: g.defaultHead.filter((h) => !RETIRED_NAV_HREFS.has(h)) }
        : {}),
    }))
    .filter((g) => g.items.length > 0);
}

// These three shadow the shared module's own exports of the same names (a
// local export wins over `export *`), so every consumer gets the filtered list.
export const NAV_GROUPS: NavGroup[] = withoutRetired(SHARED_NAV_GROUPS);

/** Flat list of every nav item, in sidebar order. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The canonical nav item for a pathname (most specific href wins). */
export function matchNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of ALL_NAV_ITEMS) {
    if (navItemMatches(item, pathname) && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best;
}
