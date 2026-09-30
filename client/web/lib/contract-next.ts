/**
 * Wire types the brain is about to have and the pinned contract does not yet
 * (client logins C6: client apps, the informational flag on an app, the
 * owner's comment thread by scope). This app pins
 * @crossworks/client-types@0.232.343, which predates them; the C6 release
 * publishes them.
 *
 * Every NEW field on a published type is optional, and every new route is
 * asked so that a 404 from an older brain shows nothing broken: this app must
 * work against a brain that does not have them yet.
 *
 * Temporary: drop when the pin reaches the C6 release. Delete this file and
 * import each name from '@mantle/client-types' instead: every import of
 * '@/lib/contract-next' or './contract-next' becomes one of those.
 */
import type {
  AppDetail as PublishedAppDetail,
  AppRow as PublishedAppRow,
  MemberAppCard as PublishedMemberAppCard,
  MemberAppList as PublishedMemberAppList,
} from '@mantle/client-types';
import type { AppTint } from '@mantle/client-types/app-nav';

// ── dto/client.ts: client apps ──────────────────────────────────────────────

/** One card of GET /api/client/apps: an app at CLIENT level with a green
 *  published build. No level, no author. `dataReadOnly`: the app is
 *  informational, so a client only reads its data. */
export type ClientAppCard = {
  id: string;
  title: string;
  icon: string | null;
  color: AppTint | null;
  description: string | null;
  updatedAt: string;
  dataReadOnly: boolean;
};

/** GET /api/client/apps: the apps a client may run, by title. */
export type ClientAppList = { apps: ClientAppCard[] };

// ── dto/member-apps.ts ──────────────────────────────────────────────────────

/** A member's launcher card gains `dataReadOnly`: true for a public app or
 *  an app an admin marked informational (the member only reads its data). */
export type MemberAppCard = PublishedMemberAppCard & { dataReadOnly?: boolean };
export type MemberAppList = Omit<PublishedMemberAppList, 'apps'> & { apps: MemberAppCard[] };

// ── dto/rows.ts: the owner's app ────────────────────────────────────────────

/** The owner's app row and detail gain `dataReadOnly` (informational: members
 *  and clients only read its data). Absent: a brain before C6. */
export type AppRow = PublishedAppRow & { dataReadOnly?: boolean };
export type AppDetail = PublishedAppDetail & { dataReadOnly?: boolean };

/** PATCH /api/apps/:id accepts the flag (admin only). */
export type AppDataReadOnlyPatch = { dataReadOnly: boolean };

// ── The owner's comment thread by scope ─────────────────────────────────────

/** GET /api/nodes/:id/comments?scope=client answers only the client thread;
 *  without `scope`, every scope (as a brain before C6 always does). */
export type NodeCommentScope = 'client';
