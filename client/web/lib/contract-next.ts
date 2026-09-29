/**
 * Wire types the brain has and the pinned contract does not yet (client
 * logins C3, old client links retire). EXACT copies of
 * @crossworks/client-types (dto/access.ts): this app pins
 * @crossworks/client-types@0.232.325, which predates them.
 *
 * Temporary. Once the pin moves past the release that carries them, delete
 * this file and import each type from '@mantle/client-types' instead (every
 * import of '@/lib/contract-next' becomes one of '@mantle/client-types').
 * Keep it to copies: nothing here may differ from the brain's own definition.
 */
import type { AccessLevel } from '@mantle/client-types';

// ── dto/access.ts: retired client links (C3) ────────────────────────────────

/** An old client link the brain retired (client logins C3, migration 0192):
 *  it answers "Sign in as a client" now. No token: the link is dead. */
export type RetiredClientLinkRow = {
  id: string;
  nodeId: string;
  nodeType: string;
  title: string;
  icon: string | null;
  /** The item's level now (client, unless an admin changed it since). */
  level: AccessLevel;
  createdAt: string;
  retiredAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
};
