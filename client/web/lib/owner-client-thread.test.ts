import { describe, expect, it } from 'vitest';
import { queryKeysForType } from './access-levels';
import {
  CLIENT_THREAD_LINE,
  OWNER_THREAD_CHIPS,
  clientThreadLabel,
  ownerCommentPath,
  ownerLevelKey,
  ownerThreadPath,
  showsClientThread,
} from './owner-client-thread';

/**
 * The client thread on the owner's side (audit U2): only at client level,
 * on the owner's own comment routes, a client's comment marked, and a level
 * the Access control's change refreshes.
 */
describe('owner client thread', () => {
  it('shows only at client level', () => {
    expect(showsClientThread('client')).toBe(true);
    for (const level of ['admin', 'team', 'public', null, undefined] as const) {
      expect(showsClientThread(level)).toBe(false);
    }
  });

  it('reads and writes the owner routes, ids encoded', () => {
    expect(ownerThreadPath('n-1')).toBe('/api/nodes/n-1/comments');
    expect(ownerThreadPath('../chat')).toBe('/api/nodes/..%2Fchat/comments');
    expect(ownerCommentPath('c/1')).toBe('/api/comments/c%2F1');
  });

  it('keeps the level under the kind’s list key, which a change of level invalidates', () => {
    for (const type of ['page', 'note', 'table', 'file'] as const) {
      const [list] = queryKeysForType(type);
      expect(ownerLevelKey(type, 'n-1').slice(0, list!.length)).toEqual(list);
      expect(ownerLevelKey(type, 'n-1')).toContain('n-1');
    }
  });

  it('marks a client’s comment, and the team’s', () => {
    expect(OWNER_THREAD_CHIPS.client).toBe('Client');
    expect(OWNER_THREAD_CHIPS.member).toBe('Team');
    expect(OWNER_THREAD_CHIPS.owner).toBeNull();
  });

  it('says clients read it', () => {
    expect(CLIENT_THREAD_LINE).toMatch(/^Clients read this thread/);
  });

  it('counts what is read, with a + when older wait', () => {
    expect(clientThreadLabel(0, false)).toBe('Client comments');
    expect(clientThreadLabel(3, false)).toBe('Client comments (3)');
    expect(clientThreadLabel(100, true)).toBe('Client comments (100+)');
  });
});
