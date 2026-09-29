/**
 * Wire types the brain is about to have and the pinned contract does not yet
 * (the client logins C2/C2b audit fixes). Each EXTENDS the published type of
 * the same name in @crossworks/client-types (dto/client.ts, dto/access.ts,
 * dto/member-apps.ts): this app pins @crossworks/client-types@0.232.325,
 * which predates them.
 *
 * Every NEW field is optional: this app must work against a brain that does
 * not send them yet. A field the brain STOPS sending (`summary`) is optional
 * here, and nothing reads it.
 *
 * Temporary. Once the pin moves past the release that carries them, delete
 * this file and import each type from '@mantle/client-types' instead (every
 * import of '@/lib/contract-next' becomes one of '@mantle/client-types').
 */
import type {
  ClientSenderRefusedReason as PublishedClientSenderRefusedReason,
  ClientSharedPage as PublishedClientSharedPage,
  ClientSharedRow as PublishedClientSharedRow,
  ClientSigninSender as PublishedClientSigninSender,
  MemberChatRow as PublishedMemberChatRow,
  MemberChatsResponse as PublishedMemberChatsResponse,
  MemberItemAuthor as PublishedMemberItemAuthor,
} from '@mantle/client-types';

// ── dto/client.ts: client reads (B1, B13) ───────────────────────────────────

/** One item in "Shared with you": an item at client level. */
export type ClientSharedRow = Omit<PublishedClientSharedRow, 'summary'> & {
  /** Never sent since 0.232.329 (it was built from the unredacted text); do
   *  not show it. */
  summary?: string | null;
};

/** GET /api/client/shared?kind=&q=&page= : newest first. */
export type ClientSharedPage = Omit<PublishedClientSharedPage, 'items'> & {
  items: ClientSharedRow[];
};

/** A table as a client reads it: an allowlist (no description, tags,
 *  summary, visibility, audience or draft), with cell refs the client may
 *  not read blanked. A brain before the audit fixes sends the whole table
 *  record instead (`data`, `tabs`, `tabId`, `docClipped`); the viewer reads
 *  both (lib/client-portal.ts, clientTableView). */
export type ClientSharedTable = {
  /** The committed column schema as the viewer needs it. */
  columns: unknown;
  /** Committed rows, with cell refs the client may not read blanked. */
  rows: unknown;
  tabs?: unknown;
  tabId?: string | null;
  rowCount?: number;
};

/** GET /api/client/shared/:id -> { item }. */
export type ClientSharedItem =
  | (ClientSharedRow & { type: 'page'; doc: unknown })
  | (ClientSharedRow & { type: 'note'; content: string })
  | (ClientSharedRow & { type: 'table'; table: ClientSharedTable })
  | (ClientSharedRow & { type: 'draw' })
  | (ClientSharedRow & {
      type: 'file';
      filename: string;
      mimeType: string | null;
      sizeBytes: number | null;
    });

// ── dto/client.ts: the sign-in sender card (B3, B4) ─────────────────────────

/** GET /api/team-admin/clients/signin-sender, and the answer to PUT. */
export type ClientSigninSender = PublishedClientSigninSender & {
  /** Codes actually handed to the mail server in the last 24 h (sentLast24h
   *  counted failed ones too; it now equals this). */
  deliveredLast24h?: number;
  /** Sends that failed in the last 24 h, and the newest failure. */
  failedLast24h?: number;
  lastFailure?: { at: string; reason: string } | null;
  /** False when no email worker serves the code queue on this box: codes are
   *  then OFF whatever the sender. */
  emailWorker?: boolean;
  /** Requests that were skipped because a cap was hit in the last 24 h (per
   *  email, per address or brain-wide). */
  capSkipsLast24h?: number;
};

/** GET /api/team-admin/clients/signin-sender/preview?accountId=<id> */
export type ClientSigninSenderPreview = {
  /** The folders that choosing this sender will leave out of mail sync.
   *  Empty + canUse false = refused. */
  sentFolders: string[];
  canUse: boolean;
  reason?: 'no-sent-folder' | 'folders-unreadable' | 'account-cannot-send';
};

/** Why an admin's sender choice was refused (the 4xx `reason`). */
export type ClientSenderRefusedReason =
  PublishedClientSenderRefusedReason | 'no-sent-folder' | 'folders-unreadable';

// ── dto/access.ts and dto/member-apps.ts: who wrote it, who chats (B26) ─────

/** Who wrote an accepted item. `role` client: a client wrote it (C5). */
export type MemberItemAuthor = PublishedMemberItemAuthor & {
  role?: 'member' | 'client' | null;
};

/** GET /api/team-admin/member-chats: one login and its chat. `role` client:
 *  a client login, never a team member. */
export type MemberChatRow = PublishedMemberChatRow & {
  role?: 'member' | 'client';
};

export type MemberChatsResponse = Omit<PublishedMemberChatsResponse, 'members'> & {
  members: MemberChatRow[];
};
