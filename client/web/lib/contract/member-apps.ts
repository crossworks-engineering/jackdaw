/**
 * Apps for members (member logins Phase 4b): what a MEMBER login's client
 * reads from /api/member/apps and /api/member/home. A member RUNS the brain apps
 * a workspace of theirs holds, with a green published build (its own apps
 * are the my-apps routes). A CLIENT login runs apps at client level only (client logins
 * C6, /api/client/apps).
 *
 * A verbatim copy of mantle packages/client-types/src/dto/member-apps.ts
 * (brain W5c, e1b3e5518). Replace the copy by hand when the brain's file
 * changes. The imports differ: AppTint is the published package's, and
 * AppDataAccess is ../app-data-pill.ts (the published pin does not have it
 * yet; the same type). The admin's member chats types are left out: W7c
 * retired /api/team-admin/member-chats and nothing here reads it.
 */
import type { AppTint } from '@mantle/client-types/app-nav';
import type { AppDataAccess } from '../app-data-pill';

/** One launcher card (GET /api/member/apps). */
export type MemberAppCard = {
  id: string;
  title: string;
  icon: string | null;
  color: AppTint | null;
  description: string | null;
  updatedAt: string;
  /** The member only reads this app's data: no workspace of theirs holds it
   *  with Write on, or an admin marked it informational. Off, the member
   *  runs AND writes it. A write to a read-only app answers 403
   *  `{ ok: false, error, reason: 'read-only' }`. */
  dataReadOnly?: boolean;
  /** The same, as the R and R/W pill shows it (team apps Phase 3). Absent
   *  from an older brain: show no pill. */
  dataAccess?: AppDataAccess;
};

/**
 * One folder of the Apps launcher as a member or a client sees it (GET
 * /api/member/apps, /api/client/apps): read only. A folder is listed only
 * when it holds, at any depth, an app of the same answer's `apps`; a folder
 * with nothing the reader may run is absent, name and all. No level, share
 * or system flag.
 */
export type AppLauncherFolder = {
  id: string;
  name: string;
  icon: string | null;
  color: AppTint | null;
  /** The folder it sits in (always one of the same list), null at the top
   *  level. */
  parentId: string | null;
  /** The apps directly in it, in the order of `apps`. An app no folder
   *  names is at the top level. */
  appIds: string[];
};

/** GET /api/member/apps: the apps a member may run, by title, and the
 *  brain's home app when a member may run it (else null). `folders`: where
 *  those apps sit, siblings in the admin's order (0.232.368 on; absent from
 *  an older brain: show the apps as one flat list). */
export type MemberAppList = {
  apps: MemberAppCard[];
  homeAppId: string | null;
  folders?: AppLauncherFolder[];
};

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
