/**
 * The owner UI's view of access levels: admin > team > client > public. A
 * caller sees what is at or below its level. The level is the truth and an
 * item's share link follows it on the server: none at admin or team (members
 * read a team item by level, signed in with their own logins), an open link
 * at client and public. There are no team links (member logins Phase 6 stage
 * 6). See the brain's docs/access-levels.md.
 *
 * Pure: no React, so the rules are unit-tested (access-levels.test.ts).
 */
import type { AccessItemView, AccessLevel } from '@mantle/client-types';

/** Highest first: the order the Access control shows them in. */
export const LEVEL_ORDER: readonly AccessLevel[] = ['admin', 'team', 'client', 'public'];

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  admin: 'Admin',
  team: 'Team',
  client: 'Client',
  public: 'Public',
};

/** One line under the control: who sees the item at this level. */
export const LEVEL_MEANING: Record<AccessLevel, string> = {
  admin: 'Only admins. Team, client and public agents cannot read it.',
  team: 'Team members see it, signed in with their own logins. No link.',
  client: 'Anyone with the link can view. Client and team agents can read it.',
  public: 'Anyone with the link can view.',
};

/** The badge tooltip on a card or detail title (no badge at admin). */
export const AUDIENCE_TITLE: Record<Exclude<AccessLevel, 'admin'>, string> = {
  team: 'Team: members see it, signed in with their own logins',
  client: 'Client: anyone with the link can view it',
  public: 'Public: anyone with the link can view it',
};

const RANK: Record<AccessLevel, number> = { public: 0, client: 1, team: 2, admin: 3 };

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === 'string' && v in RANK;
}

/** Is `a` strictly above `b`? (admin is above team, …) */
export function isAbove(a: AccessLevel, b: AccessLevel): boolean {
  return RANK[a] > RANK[b];
}

/** A link exists only where it is open, client and public, so that is where
 *  the owner sees one. A team item has no link: members read it by level. */
export function showsLink(level: AccessLevel): boolean {
  return level === 'client' || level === 'public';
}

/** The closure items (embeds, folder contents) that sit ABOVE `level`: people
 *  at `level` will not see them in the item. */
export function closureAbove(
  closure: readonly AccessItemView[],
  level: AccessLevel,
): AccessItemView[] {
  return closure.filter((c) => isAbove(c.audience, level));
}

/** The closure items that sit BELOW `level`: the item went up (back to admin,
 *  say) but these are still open to more people than it is. */
export function closureBelow(
  closure: readonly AccessItemView[],
  level: AccessLevel,
): AccessItemView[] {
  return closure.filter((c) => isAbove(level, c.audience));
}

/** The TanStack Query prefixes to refresh after an item's level changes, so
 *  its list card and detail title badge follow. */
export function queryKeysForType(type: string): string[][] {
  switch (type) {
    case 'page':
      return [['pages']];
    case 'note':
      return [['notes']];
    case 'draw':
      return [['draws']];
    case 'table':
      return [['tables']];
    case 'app':
      return [['apps']];
    case 'formula':
      return [['formulas'], ['formula']];
    case 'file':
    case 'branch':
      return [['files']];
    case 'task':
      return [['tasks']];
    case 'event':
      return [['events']];
    default:
      return [];
  }
}
