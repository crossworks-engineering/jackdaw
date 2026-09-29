/**
 * Wire types the brain has and the pinned contract does not yet (client
 * logins C2). EXACT copies of @crossworks/client-types (dto/client.ts, and
 * the member Library row of dto/member.ts): this app pins
 * @crossworks/client-types@0.232.318, which predates them.
 *
 * Temporary. Once the pin moves past the release that carries them, delete
 * this file and import each type from '@mantle/client-types' instead (every
 * import of '@/lib/contract-next' becomes one of '@mantle/client-types';
 * CLIENT_PRIVATE_LABEL, a value, comes from '@mantle/client-types/dto/client').
 * Keep it to copies: nothing here may differ from the brain's own definition.
 */
import type { MemberItemAuthor, MemberItemKind } from '@mantle/client-types';

// ── dto/client.ts ────────────────────────────────────────────────────────────

/** GET /api/client/shell: who is signed in and the brain's brand. */
export type ClientShell = {
  role: 'client';
  loginId: string;
  displayName: string | null;
  email: string;
  /** Append as `?at=` to /api/client/files/* and /api/client/draws/* srcs. */
  assetToken: string;
  siteName: string | null;
  colorTheme: string | null;
  fontLogo: string | null;
  fontTitle: string | null;
  fontUi: string | null;
  fontProse: string | null;
  fontSize: string | null;
  fontLogoSize: string | null;
  fontTitleSize: string | null;
  fontProseSize: string | null;
  logoVersion: string | null;
  logoDarkVersion: string | null;
};

/** One item in "Shared with you": an item at client level. */
export type ClientSharedRow = {
  id: string;
  type: MemberItemKind;
  title: string;
  icon: string | null;
  summary: string | null;
  updatedAt: string;
};

/** GET /api/client/shared?kind=&q=&page= : newest first. */
export type ClientSharedPage = {
  items: ClientSharedRow[];
  total: number;
  page: number;
  pageSize: number;
};

/** GET /api/client/shared/:id -> { item }. A page's doc and a note's text
 *  come with every reference to something a client may not read replaced:
 *  a mention chip or a link names "Private item" and points nowhere, an
 *  embed of such an item is left out. */
export type ClientSharedItem =
  | (ClientSharedRow & { type: 'page'; doc: unknown })
  | (ClientSharedRow & { type: 'note'; content: string })
  | (ClientSharedRow & { type: 'table'; table: unknown })
  | (ClientSharedRow & { type: 'draw' })
  | (ClientSharedRow & {
      type: 'file';
      filename: string;
      mimeType: string | null;
      sizeBytes: number | null;
    });

/** The label a client sees instead of a reference it may not read. */
export const CLIENT_PRIVATE_LABEL = 'Private item';

/** A sign-in link an admin issued (the code itself is shown once, at issue). */
export type ClientSigninLinkRow = {
  id: string;
  createdAt: string;
  expiresAt: string;
};

/** One client login, as Team admin > Clients lists it. */
export type ClientLoginRow = {
  id: string;
  email: string;
  displayName: string | null;
  contactId: string | null;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** The open (unused, unexpired, unrevoked) sign-in link, if any. */
  openLink: ClientSigninLinkRow | null;
  /** When a sign-in link of this login was last used. */
  lastLinkUsedAt: string | null;
};

/** GET /api/team-admin/clients. `reportAcknowledged`: an admin has checked
 *  "What clients see" and nothing went to client since; until then Add
 *  client and Issue sign-in link are refused (409 `report-not-acknowledged`). */
export type ClientLoginList = {
  clients: ClientLoginRow[];
  reportAcknowledged: boolean;
};

/** POST /api/team-admin/clients { email, displayName?, contactId? }
 *  -> { client }. The login has no password: it signs in with a link. */
export type ClientLoginCreated = { client: ClientLoginRow };

/** POST /api/team-admin/clients/:id/signin-link -> the link, ONCE. `path` is
 *  the client-app path to hand the client (the code is its only secret);
 *  72 hours, one use. Any older open link of the login is revoked. */
export type ClientSigninLinkCreated = {
  link: ClientSigninLinkRow;
  code: string;
  path: string;
};

/** Why an admin's client action was refused (the 4xx `reason`). */
export type ClientAdminRefusedReason =
  | 'report-not-acknowledged'
  | 'email-has-login'
  | 'contact-not-found'
  | 'contact-has-login'
  | 'no-email'
  | 'not-a-client';

/** POST /api/auth/client-link { code, email } -> 200 { ok: true } and the
 *  session cookie (30 days), or one uniform 401 for every failure. */
export type ClientLinkSignIn = { ok: true };

// ── dto/member.ts (client logins C2) ────────────────────────────────────────

/** A Library row. The member Library lists items at team AND client level
 *  since C2 (a member reads both), so a row says which. */
export type MemberLibraryRow = {
  id: string;
  type: MemberItemKind;
  title: string;
  icon: string | null;
  summary: string | null;
  audience: 'team' | 'client';
  updatedAt: string;
  /** A member wrote it and an admin accepted it (the member-authored badge).
   *  Absent from brains before 0.232.285. */
  author?: MemberItemAuthor | null;
};

/** GET /api/member/library?kind=&q=&page= */
export type MemberLibraryPage = {
  items: MemberLibraryRow[];
  total: number;
  page: number;
  pageSize: number;
};
