import { describe, expect, it } from 'vitest';
import type { AccessLevel } from '@mantle/client-types';
import {
  LEVELS_FAILED,
  OLD_ADMIN_LINK,
  canCopyLink,
  linkLevelLabel,
  needsLevelLookup,
} from './shared-links';

/**
 * Shared links (audit A18): the level rides on the rows on a current brain,
 * so the second call is only for an older one; an old client link is never
 * offered for copy; a live link on an admin item is an old open link.
 */
describe('the level lookup', () => {
  it('is skipped when every row carries its level', () => {
    expect(needsLevelLookup([{ level: 'public' }, { level: 'client' }])).toBe(false);
    expect(needsLevelLookup([])).toBe(false);
  });

  it('runs when any row comes without one (an older brain)', () => {
    expect(needsLevelLookup([{ level: 'public' }, {}])).toBe(true);
    expect(needsLevelLookup([{}])).toBe(true);
  });

  it('says so when it fails, rather than dropping the badges', () => {
    expect(LEVELS_FAILED).toMatch(/Could not load/);
  });
});

describe('Copy', () => {
  it('is not offered for an old client link', () => {
    expect(canCopyLink('client')).toBe(false);
  });

  it('is offered for every other link, and where the level is unknown', () => {
    for (const l of ['public', 'team', 'admin', undefined] as const) {
      expect(canCopyLink(l as AccessLevel | undefined), String(l)).toBe(true);
    }
  });
});

describe('the level badge', () => {
  it('names a live link on an admin item (a task, an event) an old open link', () => {
    expect(linkLevelLabel('admin')).toBe('Admin (old open link)');
    expect(OLD_ADMIN_LINK).toBe('Admin (old open link)');
  });

  it('is the level itself otherwise', () => {
    expect(linkLevelLabel('public')).toBe('Public');
    expect(linkLevelLabel('client')).toBe('Client');
  });
});
