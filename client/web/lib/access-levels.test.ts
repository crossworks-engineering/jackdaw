import { describe, expect, it } from 'vitest';
import type { AccessItemView } from '@mantle/client-types';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  effectiveOf,
  readLevel,
  viaFolderTitle,
  offeredUnder,
  sharedViaLine,
  CLIENT_MEANING_OLD_LINK,
  LEGACY_CLIENT_MEANING,
  cascadeSwitch,
  keptAtClientLine,
  levelMeaning,
  openLinkLevelsOf,
  takesLink,
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
  inheritedOf,
  readFloor,
  readThroughLine,
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

describe('brains before client logins C1 (feature-detected, audit A30d)', () => {
  it('takes the open-link levels from the brain, else client and public (before C1)', () => {
    expect(openLinkLevelsOf({ openLinkLevels: ['public'] })).toEqual(['public']);
    expect(openLinkLevelsOf({})).toEqual(['client', 'public']);
    expect(takesLink('client', openLinkLevelsOf({}))).toBe(true);
    expect(takesLink('client', openLinkLevelsOf({ openLinkLevels: ['public'] }))).toBe(false);
  });

  it("keeps a brain before C1's words for Client (an open link)", () => {
    expect(levelMeaning('client', { open: ['client', 'public'], oldLink: false })).toBe(
      LEGACY_CLIENT_MEANING,
    );
    expect(LEGACY_CLIENT_MEANING).toMatch(/^Anyone with the link can view/);
  });
});

describe('the Client meaning line (audit A30c)', () => {
  const open = ['public'] as const;

  it('says No link at Client when there is none', () => {
    expect(levelMeaning('client', { open, oldLink: false })).toBe(LEVEL_MEANING.client);
    expect(LEVEL_MEANING.client).toContain('No link');
  });

  it('never says No link above an old client link that still opens', () => {
    const line = levelMeaning('client', { open, oldLink: true });
    expect(line).toBe(CLIENT_MEANING_OLD_LINK);
    expect(line).not.toMatch(/no link/i);
    expect(line).toMatch(/^Signed-in clients \(and the team\)/);
  });

  it('leaves the other levels alone', () => {
    for (const l of ['admin', 'team', 'public'] as const) {
      expect(levelMeaning(l, { open, oldLink: true })).toBe(LEVEL_MEANING[l]);
    }
  });
});

describe('the Include sub-pages switch (audit A30b)', () => {
  const base = {
    type: 'page',
    open: ['public'] as const,
    share: { cascade: false },
    childCount: 2,
  };

  it('is a normal switch where the level makes a link', () => {
    expect(cascadeSwitch({ ...base, level: 'public' })).toBe('toggle');
    // A brain before C1: client made a link too.
    expect(cascadeSwitch({ ...base, level: 'client', open: ['client', 'public'] })).toBe('toggle');
  });

  it('at an old client link, shows only while on, to turn it off', () => {
    expect(cascadeSwitch({ ...base, level: 'client', share: { cascade: true } })).toBe('off-only');
    expect(cascadeSwitch({ ...base, level: 'client', share: { cascade: false } })).toBeNull();
  });

  it('never without a link, sub-pages, or on anything but a page', () => {
    expect(cascadeSwitch({ ...base, level: 'public', share: null })).toBeNull();
    expect(cascadeSwitch({ ...base, level: 'public', childCount: 0 })).toBeNull();
    expect(cascadeSwitch({ ...base, level: 'public', type: 'note' })).toBeNull();
    expect(cascadeSwitch({ ...base, level: 'team', share: { cascade: true } })).toBeNull();
  });
});

describe('Include sub-pages leaves client sub-pages alone', () => {
  it('says how many it kept at client, and nothing when none or not said', () => {
    expect(keptAtClientLine(['a'])).toBe('Kept at client: 1 sub-page');
    expect(keptAtClientLine(['a', 'b'])).toBe('Kept at client: 2 sub-pages');
    expect(keptAtClientLine([])).toBeNull();
    expect(keptAtClientLine(undefined)).toBeNull();
  });
});

describe('folder sharing in the Access control', () => {
  it('shows the level an item is read at: the folder’s share when more open', () => {
    expect(effectiveOf('admin', 'client')).toBe('client');
    expect(effectiveOf('team', 'client')).toBe('client');
    expect(effectiveOf('public', 'client')).toBe('public');
    expect(effectiveOf('admin', null)).toBe('admin');
  });
  it('offers nothing above the folder’s share, and everything below it', () => {
    expect(LEVEL_ORDER.filter((l) => offeredUnder(l, 'client'))).toEqual(['client', 'public']);
    expect(LEVEL_ORDER.filter((l) => offeredUnder(l, 'team'))).toEqual([
      'team',
      'client',
      'public',
    ]);
    expect(LEVEL_ORDER.filter((l) => offeredUnder(l, null))).toEqual(LEVEL_ORDER);
  });
  it('names the folder and how to hide the item', () => {
    expect(sharedViaLine({ folderId: 'f', trail: ['Clients', 'Acme'], level: 'client' })).toBe(
      'Shared with clients via Clients / Acme. Move it out of that folder to hide it.',
    );
  });
});

describe('the badge shows the level an item is read at', () => {
  it('its own level when no folder above opens it', () => {
    expect(readLevel('team', null)).toEqual({ level: 'team', viaFolder: false });
    expect(readLevel('admin', undefined)).toEqual({ level: 'admin', viaFolder: false });
    expect(readLevel('public', 'client')).toEqual({ level: 'public', viaFolder: false });
  });
  it('the folder’s share when that is more open, and says so', () => {
    expect(readLevel('admin', 'client')).toEqual({ level: 'client', viaFolder: true });
    expect(readLevel('admin', 'team')).toEqual({ level: 'team', viaFolder: true });
    expect(readLevel(undefined, 'team')).toEqual({ level: 'team', viaFolder: true });
  });
  it('nothing when a brain sends neither', () => {
    expect(readLevel(undefined, undefined)).toBeNull();
    expect(readLevel(null, null)).toBeNull();
  });
  it('names the folder in the tooltip', () => {
    expect(viaFolderTitle('client')).toMatch(
      /^Client: .*Shared through a folder above it, or an item that embeds it\.$/,
    );
  });
});

describe('read through embeds (mantle 0208)', () => {
  const via = { folderId: 'f', trail: ['Clients'], level: 'team' as const };
  const rt = {
    level: 'client' as const,
    via: [
      {
        id: 'n',
        title: 'Kickoff',
        type: 'note',
        level: 'client' as const,
        through: 'folder' as const,
      },
    ],
  };
  it('floors the control at the most open of the folder and the embedders', () => {
    expect(readFloor({ sharedVia: via })).toBe('team');
    expect(readFloor({ sharedVia: via, readThrough: rt })).toBe('client');
    expect(readFloor({ readThrough: { ...rt, level: 'team' } })).toBe('team');
    expect(readFloor(null)).toBeNull();
  });
  it('names what it is read through, and how to hide it', () => {
    expect(readThroughLine(rt)).toBe(
      'Read by clients through the note “Kickoff”, which embeds it. Take it out of that, or move that out of the shared folder, to hide it.',
    );
  });
  it('a badge counts the embedded share like the inherited one', () => {
    expect(inheritedOf({ embedded: 'client' })).toBe('client');
    expect(inheritedOf({ inherited: 'team', embedded: 'client' })).toBe('client');
    expect(inheritedOf({ inherited: 'team' })).toBe('team');
    expect(inheritedOf({})).toBeNull();
  });
});
