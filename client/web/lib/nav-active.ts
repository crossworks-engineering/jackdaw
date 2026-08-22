import type { NavGroup } from '@mantle/web-ui/layout/nav-items';

/**
 * Which sidebar row a pathname belongs to.
 *
 * This file was `settings-hub-nav.ts`, and most of it was a render-time collapse
 * that folded thirteen settings screens into a single "Settings" row pointing at
 * a card hub. That is undone — the screens are their own rows again — so the
 * collapse is gone and only the matcher below survives.
 *
 * It survives because it was never really about the hub: it is the general rule
 * for a nav list where one href can be a prefix of another, and the sidebar
 * still has such pairs.
 */

/**
 * The one visible item a pathname belongs to — the longest matching href wins.
 *
 * The sidebar used to ask `navItemMatches` per item, independently, which is
 * fine only while no entry is a prefix of another. The hub row that broke that
 * assumption is gone, but the rule stays: it costs one comparison, it is what
 * `matchNavItem` already does for usage attribution, and the next nested route
 * added to the nav would otherwise light two rows at once with nothing to
 * explain why.
 *
 * It also settles the duplicate a Favorites group creates. A starred screen
 * appears twice — once pinned, once in its home group — with the SAME href, so
 * both rows match and both light. That is intended: it is one destination, and
 * a pinned row that stayed dark while its twin lit would read as a different
 * place.
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
