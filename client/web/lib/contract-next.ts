/**
 * Wire types the brain has and the pinned contract does not yet (client
 * logins C0 and C1). EXACT copies of @crossworks/client-types
 * (dto/logins.ts, dto/access.ts, dto/rows.ts): this app pins
 * @crossworks/client-types@0.232.316, which predates them.
 *
 * Temporary. Once the pin moves past 0.232.316, delete this file and import
 * each type from '@mantle/client-types' instead (every import of
 * '@/lib/contract-next' becomes one of '@mantle/client-types'). Keep it to
 * copies: nothing here may differ from the brain's own definition.
 */
import type { AccessLevel, ShareMode } from '@mantle/client-types';

// ── dto/logins.ts ────────────────────────────────────────────────────────────

/** Who a login is. The brain reads it from the login row on every request. */
export type LoginKind = 'admin' | 'member' | 'client';

/** The `reason` of a 403 a gate answers a login of the wrong role with:
 *  `member-login` from an admin route, `admin-login` from a member route,
 *  `client-login` from any route that is not a client route. */
export type LoginRefusedReason = 'member-login' | 'admin-login' | 'client-login';

/** The body of that 403. */
export type LoginRefused = {
  error: 'forbidden';
  reason: LoginRefusedReason;
  message: string;
};

// ── dto/rows.ts ──────────────────────────────────────────────────────────────

/**
 * Why a link was refused (the `reason` of a 400 from the share routes):
 * `team-links-retired` for a team link (member logins Phase 6), and
 * `client-links-retired` for any link on an item at client level (client
 * logins C1): client means signed-in clients, and public is the only level
 * with an open link.
 */
export type ShareRetiredReason = 'team-links-retired' | 'client-links-retired';

// ── dto/access.ts ────────────────────────────────────────────────────────────

/** A brain item a client-level item names but a client may not read: a
 *  mention chip, a link or an embed pointing at a team or admin item (or at
 *  something that is not the brain's). Its title reaches the client page as
 *  a label unless the client view hides it. */
export type ClientReportRef = {
  id: string;
  /** Null when the id names nothing the brain holds any more. */
  type: string | null;
  title: string | null;
  /** The item's level; null when it is not a brain item (a personal item,
   *  or gone). */
  audience: AccessLevel | null;
};

/** One item at client level, as the report lists it. */
export type ClientReportItem = {
  id: string;
  type: string;
  title: string;
  updatedAt: string;
  /** Its live open link, made when client meant "anyone with the link":
   *  still live until the old client links are retired. Null: none. */
  link: {
    id: string;
    createdAt: string;
    viewCount: number;
    lastViewedAt: string | null;
    expiresAt: string | null;
  } | null;
  /** Addresses a page was emailed to with the page tool (invite hints). */
  emailedTo: string[];
  /** What it names that a client may not read (see ClientReportRef). */
  refsAbove: ClientReportRef[];
};

/** The newest acknowledgement of the report. */
export type ClientReportAck = {
  ackedAt: string;
  /** The admin who acknowledged it (null: that login is gone). */
  ackedBy: { id: string; name: string } | null;
  /** How many client-level items the admin saw. */
  itemCount: number;
};

/** GET /api/access/client-report: every item at client level, what each
 *  carries, and whether an admin has acknowledged the list. Adding a client
 *  login stays disabled until `acknowledged` (client logins C2). */
export type ClientReport = {
  items: ClientReportItem[];
  /** All client-level items (the list stops at 2000). */
  total: number;
  acknowledgement: ClientReportAck | null;
  /** An admin acknowledged the report and nothing has gone to client since. */
  acknowledged: boolean;
  /** Client-level items the newest acknowledgement did not include. */
  newSinceAck: string[];
};

/** POST /api/access/client-report/ack { itemIds } -> the acknowledgement.
 *  `itemIds`: the client-level items the admin saw on the report. */
export type ClientReportAckResponse = { acknowledgement: ClientReportAck; acknowledged: boolean };

/** GET /api/shares/all -> { shares: SharedLinkRow[] }: every live link,
 *  newest first. */
export type SharedLinkRow = {
  id: string;
  /** Server-relative: `/s/<token>`. */
  path: string;
  nodeId: string;
  nodeType: string;
  title: string;
  icon: string | null;
  mode: ShareMode;
  cascade: boolean;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  /** The item's level (client logins C1): `client` marks an old link, from
   *  when client meant an open link. Absent from brains before C1. */
  level?: AccessLevel;
};
