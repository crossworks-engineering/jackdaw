/**
 * The owner UI's view of access levels: admin > team > client > public. A
 * caller sees what is at or below its level. The level is the truth and an
 * item's share link follows it on the server: none at admin or team (members
 * read a team item by level, signed in with their own logins), none at
 * client (signed-in clients, client logins C1), and an open link at public,
 * the ONLY level with one. There are no team links (member logins Phase 6
 * stage 6), and a link on a client item is refused (`client-links-retired`).
 * Links made on client items before C1 were retired by client logins C3
 * (brain migration 0192): they ask their visitors to sign in as a client,
 * and only a brain before C3 still has one live. See the brain's
 * docs/access-levels.md.
 *
 * Pure: no React, so the rules are unit-tested (access-levels.test.ts).
 */
import type { AccessItemView, AccessLevel } from '@mantle/client-types';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { ShareRetiredReason } from '@mantle/client-types';

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
  client: 'Signed-in clients (and the team). No link. Client and team agents can read it.',
  public: 'Anyone with the link can view.',
};

/** The badge tooltip on a card or detail title (no badge at admin). */
export const AUDIENCE_TITLE: Record<Exclude<AccessLevel, 'admin'>, string> = {
  team: 'Team: members see it, signed in with their own logins',
  client: 'Client: signed-in clients (and the team)',
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

/** A link exists only where it is open, and public is the one level with an
 *  open link, so that is where the owner sees one. A team item has no link
 *  (members read it by level), and neither has a client item (signed-in
 *  clients read it, client logins C1). */
export function showsLink(level: AccessLevel): boolean {
  return level === 'public';
}

// ── Brains before client logins C1 (feature-detected) ──────────────────────
// C1 made public the one level with an open link; before it, client made
// one too. A brain says which levels make a link (`openLinkLevels`, from the
// audit-fix release on); a brain without the field is taken as one before
// C1, and the control keeps that brain's old words (Client = open link).

/** The levels a brain before C1 made an open link at. */
export const LEGACY_OPEN_LINK_LEVELS: readonly AccessLevel[] = ['client', 'public'];

/** The levels this brain makes an open link at. */
export function openLinkLevelsOf(view: {
  openLinkLevels?: readonly AccessLevel[];
}): readonly AccessLevel[] {
  return view.openLinkLevels ?? LEGACY_OPEN_LINK_LEVELS;
}

/** Does this brain give an item at `level` an open link? */
export function takesLink(level: AccessLevel, open: readonly AccessLevel[]): boolean {
  return open.includes(level);
}

/** Client, as a brain before C1 meant it. */
export const LEGACY_CLIENT_MEANING =
  'Anyone with the link can view. Client and team agents can read it.';

/** Client on an item that still has its old link: no "No link" right above
 *  the line that says the old link still opens. */
export const CLIENT_MEANING_OLD_LINK =
  'Signed-in clients (and the team). Client and team agents can read it.';

/** The line under the level control: who sees the item at `level`. */
export function levelMeaning(
  level: AccessLevel,
  { open, oldLink }: { open: readonly AccessLevel[]; oldLink: boolean },
): string {
  if (level === 'client') {
    if (takesLink('client', open)) return LEGACY_CLIENT_MEANING;
    if (oldLink) return CLIENT_MEANING_OLD_LINK;
  }
  return LEVEL_MEANING[level];
}

/** The "Include sub-pages" switch for a page with a link: a normal switch
 *  where the level makes a link, and at an old client link only a way to
 *  turn it OFF (the brain refuses to extend an old client link). */
export function cascadeSwitch(input: {
  type: string;
  level: AccessLevel;
  open: readonly AccessLevel[];
  share: { cascade: boolean } | null;
  childCount: number;
}): 'toggle' | 'off-only' | null {
  const { type, level, open, share, childCount } = input;
  if (type !== 'page' || !share || childCount <= 0) return null;
  if (takesLink(level, open)) return 'toggle';
  return isOldClientLink(level) && share.cascade ? 'off-only' : null;
}

/** What "Include sub-pages" left alone: client sub-pages keep client and
 *  take no link. Null when none (or a brain that does not say). */
export function keptAtClientLine(skipped: readonly string[] | undefined): string | null {
  const n = skipped?.length ?? 0;
  return n > 0 ? `Kept at client: ${n} sub-page${n === 1 ? '' : 's'}` : null;
}

/** A live link on an item at client level is an OLD client link: made when
 *  client meant "anyone with the link". Client logins C3 retired them all
 *  (brain migration 0192), so only a brain before C3 still shows one; on a
 *  C3 brain this is never true of a live link. Undefined (a brain before C1
 *  sends no level): nothing to say. */
export function isOldClientLink(level: AccessLevel | undefined): boolean {
  return level === 'client';
}

/** Each live link's item level by link id, from GET /api/shares/all (whose
 *  rows carry `level` since client logins C1). A row without one (an older
 *  brain) is left out, so the caller shows nothing extra for it. */
export function linkLevels(
  rows: readonly { id: string; level?: AccessLevel }[] | undefined,
): Map<string, AccessLevel> {
  const out = new Map<string, AccessLevel>();
  for (const r of rows ?? []) if (r.level && isAccessLevel(r.level)) out.set(r.id, r.level);
  return out;
}

/** What an old client link is, in the owner's words. */
export const OLD_CLIENT_LINK = 'Old client link: clients will sign in instead';

/** The reason of a refused link (400 from the share routes), or null. */
export function shareRetiredReason(err: unknown): ShareRetiredReason | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const reason = err.body?.reason;
  return reason === 'client-links-retired' || reason === 'team-links-retired' ? reason : null;
}

/** The toast for a failed level or link change. A refused client link
 *  (`client-links-retired`) says the brain's own words; anything else says
 *  its message, or `fallback`. */
export function accessErrorMessage(err: unknown, fallback: string): string {
  if (shareRetiredReason(err) === 'client-links-retired') {
    return err instanceof Error && err.message
      ? err.message
      : 'Client items have no open link: clients sign in to read them. Set the item to Public for an open link.';
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Each item kind in the owner's words (links, the client report). */
export const ITEM_KIND_LABEL: Record<string, string> = {
  page: 'Page',
  note: 'Note',
  draw: 'Drawing',
  task: 'Task',
  event: 'Event',
  file: 'File',
  app: 'App',
  table: 'Table',
  formula: 'Formula',
  branch: 'Folder',
};

export function kindLabel(type: string): string {
  return ITEM_KIND_LABEL[type] ?? type;
}

/** What setting the item to `next` will also share: the embeds above `next`,
 *  shown before the admin confirms. Nothing at admin, and nothing where the
 *  embeds do not follow (`AccessNodeView.embedsFollow` false: a folder, or a
 *  brain before 0.232.314, which answers without the field). */
export function embedsSharedWith(
  follows: boolean,
  closure: readonly AccessItemView[],
  next: AccessLevel,
): AccessItemView[] {
  if (!follows || next === 'admin') return [];
  return closureAbove(closure, next);
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

// ── Folder sharing (the brain's folder plan, phase 4) ──────────────────────
// An item in a shared folder is read at least at the folder's share, whatever
// its own level says. The Access control shows the level it is READ at, names
// the folder ("Shared via Clients / Acme"), and offers nothing above it:
// moving it out of the folder is how to hide it. Lowering further is fine.

/** TEMPORARY contract shim: `AccessSharedVia` and `AccessNodeView.sharedVia`
 *  from the brain's `@crossworks/client-types` (mantle
 *  packages/client-types/src/dto/access.ts), which the pinned contract
 *  predates. Absent from brains before folder sharing. At the pin bump these
 *  become imports. */
export type AccessSharedVia = {
  folderId: string;
  /** Folder names from the kind's top level down to the shared folder. */
  trail: string[];
  level: 'team' | 'client';
};
export type AccessViewShared = { sharedVia?: AccessSharedVia | null };

/** The level an item is read at: its own, or its folder's share when that is
 *  more open. */
export function effectiveOf(own: AccessLevel, floor: AccessLevel | null | undefined): AccessLevel {
  return floor && isAbove(own, floor) ? floor : own;
}

/** Whether the control offers `level` under a shared folder's share: never
 *  above it. */
export function offeredUnder(level: AccessLevel, floor: AccessLevel | null | undefined): boolean {
  return !floor || !isAbove(level, floor);
}

/** The line under the control for an item in a shared folder. */
export function sharedViaLine(via: AccessSharedVia): string {
  const who = via.level === 'team' ? 'the team' : 'clients';
  return `Shared with ${who} via ${via.trail.join(' / ')}. Move it out of that folder to hide it.`;
}

/** The level a badge shows: the level an item is READ at (its own, or the
 *  share it takes from a folder above when that is more open), and whether
 *  the folder is why. Null own level (a brain that sends none) with no
 *  inherited share: nothing to say. */
export function readLevel(
  own: AccessLevel | null | undefined,
  inherited: 'team' | 'client' | null | undefined,
): { level: AccessLevel; viaFolder: boolean } | null {
  if (!own) return inherited ? { level: inherited, viaFolder: true } : null;
  const level = effectiveOf(own, inherited);
  return { level, viaFolder: level !== own };
}

/** The badge's tooltip for a level a folder above opened. */
export function viaFolderTitle(level: Exclude<AccessLevel, 'admin'>): string {
  return `${AUDIENCE_TITLE[level]}. Shared through a folder above it.`;
}
