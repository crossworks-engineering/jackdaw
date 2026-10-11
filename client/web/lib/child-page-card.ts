/**
 * A sub-page card in the page editor (client tier audit U3): where it reads
 * the child's live title, and where it links. Since workspaces W6b every
 * login reads GET /api/pages/:id in its own scope and opens /pages, so both
 * are for any known role; a role not known yet keeps the snapshot and is no
 * link (fail closed). A child the login may not read answers 404 there, and
 * the card keeps its snapshot.
 *
 * Pure: pinned by child-page-card.test.ts.
 */
import type { ShellRole as ViewerRole } from './workspaces';

/** The route the card asks for the live title and icon, or null to keep the
 *  snapshot. */
export function childPageLivePath(role: ViewerRole | null, pageId: string | null): string | null {
  if (!pageId || !role) return null;
  return `/api/pages/${encodeURIComponent(pageId)}`;
}

/** Where the card links, or null for a plain card. */
export function childPageHref(role: ViewerRole | null, pageId: string | null): string | null {
  if (!pageId || !role) return null;
  return `/pages/${encodeURIComponent(pageId)}`;
}
