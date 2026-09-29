/**
 * Wire fields the brain is getting and the pinned contract does not have yet
 * (the client logins C0/C1 audit fixes). Each type EXTENDS the published one
 * with the new fields, all optional: a brain before the fixes sends none of
 * them, and every screen that reads one works without it.
 *
 * Temporary. Once the pin moves past the mantle release that carries them,
 * delete this file and import each type from '@mantle/client-types' instead
 * (the extended names are the published names). The review pieces have no
 * published type yet (jackdaw's lib/member-review.ts mirrors the brain's);
 * they move with those types. Keep it to the brain's own definitions.
 */
import type {
  AccessItemView,
  AccessLevel,
  AccessNodeView as PublishedAccessNodeView,
  ClientReport as PublishedClientReport,
  ClientReportItem as PublishedClientReportItem,
} from '@mantle/client-types';

// ── dto/access.ts: "What clients see" ───────────────────────────────────────

/** A live open link on something ABOVE a client-level item (a folder that
 *  holds it, or a client page that embeds it): made when client meant
 *  "anyone with the link", still live until old client links retire. Anyone
 *  with that link can open this item. */
export type ClientOldLinkAbove = {
  shareId: string;
  /** The folder or page that carries the link. */
  nodeId: string;
  title: string;
  type: string;
  via: 'folder' | 'page';
};

export type ClientReportItem = PublishedClientReportItem & {
  oldLinksAbove?: ClientOldLinkAbove[];
};

export type ClientReport = Omit<PublishedClientReport, 'items'> & {
  items: ClientReportItem[];
  /** sha256 hex of every current client-level item id (sorted, joined by
   *  ','), the WHOLE set, not the 2000 shown. Send it back to acknowledge. */
  fingerprint?: string;
};

/** POST /api/access/client-report/ack: the fingerprint (preferred), or the
 *  ids shown (a brain before the fingerprint). A fingerprint that no longer
 *  matches answers 409 `report-changed`. */
export type ClientReportAckBody = { fingerprint: string } | { itemIds: string[] };

// ── dto/access.ts: the Access popover ───────────────────────────────────────

export type AccessNodeView = PublishedAccessNodeView & {
  /** Levels at which this brain makes a NEW open link (client logins C1:
   *  ['public']). Absent on brains before C1: the client then uses the old
   *  copy (Client = open link). */
  openLinkLevels?: AccessLevel[];
  /** Old live links above this item (see ClientOldLinkAbove); only for an
   *  item at client. */
  oldLinksAbove?: ClientOldLinkAbove[];
};

// ── Review and Accept ───────────────────────────────────────────────────────

export type ReviewAuthorRole = 'member' | 'client';

/** The review queue row's author object gains its login's role. */
export type ReviewAuthorNext = { role?: ReviewAuthorRole | null };

/** The Accept preview (GET .../bundle) gains the embed closure. */
export type AcceptPreviewNext = {
  /** Brain items in the embed closure of what Accept moves in, with their
   *  CURRENT level. The ones above the chosen level go DOWN with it and need
   *  a tick. */
  closure?: AccessItemView[];
};

/** The Accept body gains the ticked closure items. */
export type AcceptBodyNext = {
  lowerConfirmed?: boolean;
  /** Ids of closure items the admin ticked (with lowerConfirmed: true). */
  confirmedIds?: string[];
};

/** 409 from Accept when the level needs a confirmation. */
export type ConfirmLevelRefusal = {
  error: string;
  reason: 'confirm-level';
  message?: string;
  goingDown?: AccessItemView[];
};

// ── Password reset ──────────────────────────────────────────────────────────

/** 400 from POST /api/users/:id/password on a client (or unknown-role)
 *  login: it has no password to reset. */
export type PasswordResetRefusal = {
  error: string;
  reason: 'not-a-password-login';
  message: string;
};
