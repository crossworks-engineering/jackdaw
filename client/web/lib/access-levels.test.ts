import { describe, expect, it } from 'vitest';
import type { AccessItemView } from '@mantle/client-types';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  AUDIENCE_TITLE,
  LEVEL_MEANING,
  OLD_CLIENT_LINK,
  accessErrorMessage,
  isOldClientLink,
  kindLabel,
  linkLevels,
  LEVEL_ORDER,
  closureAbove,
  closureBelow,
  embedsSharedWith,
  isAbove,
  isAccessLevel,
  queryKeysForType,
  showsLink,
} from './access-levels';

const item = (id: string, audience: AccessItemView['audience']): AccessItemView => ({
  id,
  type: 'file',
  title: id,
  audience,
});

describe('access levels', () => {
  it('orders admin > team > client > public', () => {
    expect(LEVEL_ORDER).toEqual(['admin', 'team', 'client', 'public']);
    for (let i = 0; i < LEVEL_ORDER.length - 1; i++) {
      expect(isAbove(LEVEL_ORDER[i]!, LEVEL_ORDER[i + 1]!)).toBe(true);
      expect(isAbove(LEVEL_ORDER[i + 1]!, LEVEL_ORDER[i]!)).toBe(false);
    }
    expect(isAbove('team', 'team')).toBe(false);
  });

  it('recognises only the four levels', () => {
    expect(isAccessLevel('client')).toBe(true);
    expect(isAccessLevel('everyone')).toBe(false);
    expect(isAccessLevel(undefined)).toBe(false);
  });

  it('shows a link only at public (client logins C1: client takes no link)', () => {
    expect(LEVEL_ORDER.filter(showsLink)).toEqual(['public']);
  });

  it('says client means signed-in clients (and the team), never an open link', () => {
    expect(LEVEL_MEANING.client).toMatch(/^Signed-in clients \(and the team\)/);
    expect(AUDIENCE_TITLE.client).toMatch(/signed-in clients \(and the team\)/);
    for (const text of [LEVEL_MEANING.client, AUDIENCE_TITLE.client]) {
      expect(text).not.toMatch(/anyone with the link|open link/i);
    }
    // Public keeps its link.
    expect(LEVEL_MEANING.public).toMatch(/anyone with the link/i);
  });

  it('marks a live link on a client item as an old client link, and nothing else', () => {
    expect(isOldClientLink('client')).toBe(true);
    for (const l of ['admin', 'team', 'public', undefined] as const) {
      expect(isOldClientLink(l), String(l)).toBe(false);
    }
    expect(OLD_CLIENT_LINK).toBe('Old client link: clients will sign in instead');
  });

  it("says a refused client link in the brain's words", () => {
    const words = 'Client items have no open link: clients sign in to read them.';
    const refused = new ApiError(words, 400, { error: words, reason: 'client-links-retired' });
    expect(accessErrorMessage(refused, 'fallback')).toBe(words);
    // With no message of its own, it still says why rather than the fallback.
    const bare = new ApiError('', 400, { reason: 'client-links-retired' });
    expect(accessErrorMessage(bare, 'fallback')).toMatch(/clients sign in/);
    expect(accessErrorMessage(new ApiError('Not found.', 404), 'fallback')).toBe('Not found.');
    expect(accessErrorMessage('nope', 'fallback')).toBe('fallback');
  });

  it("reads each link's level by id, leaving out rows without one (an older brain)", () => {
    const map = linkLevels([
      { id: 'a', level: 'public' },
      { id: 'b', level: 'client' },
      { id: 'c' },
      { id: 'd', level: 'everyone' as 'public' },
    ]);
    expect([...map.entries()]).toEqual([
      ['a', 'public'],
      ['b', 'client'],
    ]);
    expect(linkLevels(undefined).size).toBe(0);
  });

  it('names each kind, and passes an unknown one through', () => {
    expect(kindLabel('branch')).toBe('Folder');
    expect(kindLabel('draw')).toBe('Drawing');
    expect(kindLabel('journal')).toBe('journal');
  });

  it('says a team item reaches members by their logins, not a link or the old workspace', () => {
    // Team links and the team-code workspace are retired (member logins
    // Phase 6 stage 6): members read a team item by level.
    for (const text of [LEVEL_MEANING.team, AUDIENCE_TITLE.team]) {
      expect(text).toMatch(/members/i);
      expect(text).toMatch(/logins/);
      expect(text).not.toMatch(/workspace|team-only|anyone with the link/i);
    }
  });

  it('lists the closure items above a level', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(closureAbove(closure, 'team').map((c) => c.id)).toEqual(['a']);
    expect(closureAbove(closure, 'public').map((c) => c.id)).toEqual(['a', 't']);
    expect(closureAbove(closure, 'admin')).toEqual([]);
  });

  it('lists the closure items below a level (MED 7)', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(closureBelow(closure, 'admin').map((c) => c.id)).toEqual(['t', 'p']);
    expect(closureBelow(closure, 'team').map((c) => c.id)).toEqual(['p']);
    expect(closureBelow(closure, 'public')).toEqual([]);
  });

  it('refreshes the screens that show the item', () => {
    expect(queryKeysForType('page')).toEqual([['pages']]);
    expect(queryKeysForType('branch')).toEqual([['files']]);
    expect(queryKeysForType('formula')).toEqual([['formulas'], ['formula']]);
    expect(queryKeysForType('journal')).toEqual([]);
  });

  it('says what lowering will also share, only where the brain lowers embeds', () => {
    const closure = [item('a', 'admin'), item('t', 'team'), item('p', 'public')];
    expect(embedsSharedWith(true, closure, 'public').map((c) => c.id)).toEqual(['a', 't']);
    expect(embedsSharedWith(true, closure, 'team').map((c) => c.id)).toEqual(['a']);
    // Raising shares nothing.
    expect(embedsSharedWith(true, closure, 'admin')).toEqual([]);
    // A folder's contents do not follow it, and an older brain does not lower them.
    expect(embedsSharedWith(false, closure, 'public')).toEqual([]);
  });
});
