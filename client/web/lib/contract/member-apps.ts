/**
 * The member home (member logins Phase 4b): what a MEMBER login's client
 * reads from /api/member/home, the brain's pinned home app and its hub.
 *
 * Copied from mantle packages/client-types/src/dto/member-apps.ts (brain
 * W5c, e1b3e5518), keeping only the /api/member/home types; nothing here
 * reads /api/member/apps. Replace the copy by hand when the brain's file
 * changes. AppTint is the published package's.
 */
import type { AppTint } from '@mantle/client-types/app-nav';

/** The brain's pinned home app, when a member may run it. */
export type MemberHomeApp = {
  appId: string;
  title: string;
  icon: string | null;
  color: AppTint | null;
};

/**
 * GET /api/member/home: the pinned home app (null = the built-in home, and
 * then `hub` is null too) and what its `host.hub.get()` answers. A section's
 * token is a page id; an app card's token is an app id.
 *
 * `THub` is the hub payload, `HubData` from
 * `@mantle/share-ui/app-bridge-protocol`. The contract leaves it to the
 * client (share-ui depends on this package, so it cannot be named here):
 * write `MemberHomeData<HubData>`.
 */
export type MemberHomeData<THub = unknown> =
  { homeApp: MemberHomeApp; hub: THub } | { homeApp: null; hub: null };
