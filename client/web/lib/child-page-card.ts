/**
 * A sub-page card in the page editor (client tier audit U3): where it reads
 * the child's live title, and where it links. Only a confirmed admin reads
 * the admin page route; a member keeps the snapshot (the admin route refuses
 * it) and so does a client, or a role not known yet (fail closed, the same
 * rule as RoleSwitch). A client has no page screen to open, so its card is
 * no link at all.
 *
 * Pure: pinned by child-page-card.test.ts.
 */
import type { ViewerRole } from './shell-role';

/** The route the card asks for the live title and icon, or null to keep the
 *  snapshot. */
export function childPageLivePath(role: ViewerRole | null, pageId: string | null): string | null {
  if (!pageId || role !== 'admin') return null;
  return `/api/pages/${encodeURIComponent(pageId)}`;
}

/** Where the card links, or null for a plain card. */
export function childPageHref(role: ViewerRole | null, pageId: string | null): string | null {
  if (!pageId || (role !== 'admin' && role !== 'member')) return null;
  return `/pages/${encodeURIComponent(pageId)}`;
}
