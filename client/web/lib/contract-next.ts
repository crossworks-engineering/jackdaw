/**
 * Wire types the brain is about to have and the pinned contract does not yet
 * (the client logins C5 audit fixes: paged comment threads, the comment and
 * size refusals, and Team admin > Clients' storage and client comments
 * cards). This app pins @crossworks/client-types@0.232.342, which predates
 * them; the fix release publishes them.
 *
 * Every NEW field on a published type is optional, and every new route is
 * asked so that a 404 from an older brain shows nothing broken: this app must
 * work against a brain that does not have them yet.
 *
 * Temporary: drop when the pin reaches the fix release. Delete this file and
 * import each name from '@mantle/client-types' instead: every import of
 * '@/lib/contract-next' or './contract-next' becomes one of those.
 */
import type {
  ClientCommentThread as PublishedClientCommentThread,
  NodeComment,
} from '@mantle/client-types';

// ── dto/client.ts: comment threads are paged ────────────────────────────────

/**
 * Every comment thread's answer (the client thread, the member Library
 * thread, the review talk on either side, and the owner's
 * /api/nodes/:id/comments): the NEWEST 100 comments, oldest first, and
 * `hasMore` when older ones exist; `?before=<ISO createdAt of the oldest
 * shown>` answers the 100 before it. A brain before the fix answers the
 * whole thread and no `hasMore`.
 */
export type ClientCommentThread = PublishedClientCommentThread & { hasMore?: boolean };

/** The same page, for a thread of another comment shape. */
export type CommentThreadPage<C = NodeComment> = { comments: C[]; hasMore?: boolean };

/**
 * Why the brain refused a comment: a CLIENT login's 100 comments a day
 * across every thread (429 `comment-cap`, deleting does not refund), or a
 * thread that holds 1000 already (409 `thread-full`). Each comes with the
 * brain's sentence in `error`.
 */
export type ClientCommentRefusedReason = 'comment-cap' | 'thread-full';

// ── dto/client.ts: Team admin > Clients ─────────────────────────────────────

/** GET /api/team-admin/clients/storage (admin only): what the clients'
 *  own spaces hold against the brain's caps, and the recent refusals. */
export type ClientStorageUsage = {
  limits: {
    fileMaxBytes: number;
    perClientBytes: number;
    dailyUploadBytes: number;
    itemLimit: number;
    totalBytes: number;
    submitsPerDay: number;
    openSubmissions: number;
  };
  totalUsedBytes: number;
  rows: {
    loginId: string;
    name: string;
    usedBytes: number;
    uploadedTodayBytes: number;
    items: number;
    openSubmissions: number;
    /** A deleted client whose space still counts until it is purged. */
    former: boolean;
  }[];
  /** Quota refusals in the last 7 days, newest first, at most 50. */
  refusals: { at: string; loginId: string | null; reason: string }[];
};

/** GET /api/team-admin/clients/comments?days=7 (admin only): the
 *  client-level items whose client thread had a CLIENT comment in the
 *  window, newest first, at most 100. */
export type ClientThreadActivity = {
  rows: {
    nodeId: string;
    title: string;
    type: string;
    lastCommentAt: string;
    clientComments: number;
    lastClientName: string;
  }[];
};

/** DELETE /api/team-admin/clients/:id/comments (admin only): every comment
 *  that client login wrote is removed (client threads and review talk). */
export type ClientCommentsDeleted = { deleted: number };
