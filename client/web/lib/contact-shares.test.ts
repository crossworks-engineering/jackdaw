import { describe, expect, it } from 'vitest';
import {
  brainHasContactShares,
  canShareWithContact,
  contactHref,
  contactSharesHint,
  disableSharingLine,
  lastUsedLine,
  offersCanWrite,
  pickBlocked,
  revokeAllLine,
} from './contact-shares';

const sharing = {
  enabledAt: '2026-10-01T00:00:00Z',
  lastUsedAt: null,
  locked: false,
  shareCount: 0,
};

describe('contact shares in the owner UI (brain migration 0214)', () => {
  it('knows a brain with contact shares by the contact row', () => {
    expect(brainHasContactShares({ sharing: null })).toBe(true);
    expect(brainHasContactShares({ sharing })).toBe(true);
    expect(brainHasContactShares({})).toBe(false);
    expect(brainHasContactShares(null)).toBe(false);
  });

  it('offers contact shares on single workspace items, never a folder; Can write on apps only', () => {
    const view = (type: string, canLower = true) => ({
      item: { id: 'x', type, title: 't', audience: 'admin' as const },
      canLower,
    });
    expect(canShareWithContact(view('page'))).toBe(true);
    expect(canShareWithContact(view('app'))).toBe(true);
    expect(canShareWithContact(view('branch'))).toBe(false);
    expect(canShareWithContact(view('task', false))).toBe(false);
    expect(offersCanWrite('app')).toBe(true);
    expect(offersCanWrite('page')).toBe(false);
  });

  it('greys a contact with sharing off, and one already shared', () => {
    const shared = new Set(['b']);
    expect(pickBlocked({ id: 'a', sharing }, shared)).toBeNull();
    expect(pickBlocked({ id: 'a', sharing: null }, shared)).toBe('sharing-off');
    expect(pickBlocked({ id: 'a' }, shared)).toBe('sharing-off');
    expect(pickBlocked({ id: 'b', sharing }, shared)).toBe('already-shared');
  });

  it('says the team does not see a contact-shared item', () => {
    expect(contactSharesHint(undefined)).toBeNull();
    expect(contactSharesHint([])).toBeNull();
    const one = {
      shareId: 's',
      contactId: 'c',
      name: 'Ann',
      canWrite: false,
      sharingOn: true,
      lastOpenedAt: null,
      path: '/s/t',
    };
    expect(contactSharesHint([one, { ...one, shareId: 's2' }])).toBe(
      'Shared with 2 contacts. The team does not see it.',
    );
  });

  it('names how many shares a switch off or a Revoke all ends', () => {
    expect(disableSharingLine('Ann', 2)).toContain('2 shares with them will end.');
    expect(disableSharingLine('Ann', 0)).toContain('Nothing is shared with them now.');
    expect(revokeAllLine('Ann', 1)).toBe(
      "1 item shared with Ann will stop opening. Their code still works for anything you share later. No item's level changes.",
    );
    expect(lastUsedLine(sharing, (s) => s)).toBe('Code not used yet');
    expect(lastUsedLine({ ...sharing, lastUsedAt: 'then' }, (s) => s)).toBe('Code last used then');
    expect(contactHref('a b')).toBe('/contacts?id=a%20b');
  });
});
