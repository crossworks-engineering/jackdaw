import { describe, expect, it } from 'vitest';
import { queryKeysForType } from './access-levels';
import { threadPagePath } from './thread-pages';
import {
  CLIENT_THREAD_LINE,
  OWNER_THREAD_CHIPS,
  clientThreadLabel,
  ownerClientThreadPath,
  ownerCommentPath,
  ownerLevelKey,
  ownerThreadPath,
  showsClientThread,
  threadLevelUnknown,
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

  it('shows on an item in a folder shared with clients, whatever its own level', () => {
    for (const level of ['admin', 'team', 'public'] as const) {
      expect(showsClientThread(level, 'client')).toBe(true);
      expect(showsClientThread(level, 'team')).toBe(false);
      expect(showsClientThread(level, null)).toBe(false);
    }
    expect(showsClientThread('client', 'team')).toBe(true);
  });

  it('asks the Access route only for what the view does not know', () => {
    expect(threadLevelUnknown(undefined, undefined)).toBe(true);
    expect(threadLevelUnknown(undefined, null)).toBe(true);
    // A brain before the inherited field: the level alone can say yes.
    expect(threadLevelUnknown('client', undefined)).toBe(false);
    expect(threadLevelUnknown('admin', undefined)).toBe(true);
    expect(threadLevelUnknown('admin', null)).toBe(false);
    expect(threadLevelUnknown('admin', 'client')).toBe(false);
  });

  it('reads and writes the owner routes, ids encoded', () => {
    expect(ownerThreadPath('n-1')).toBe('/api/nodes/n-1/comments');
    expect(ownerThreadPath('../chat')).toBe('/api/nodes/..%2Fchat/comments');
    expect(ownerCommentPath('c/1')).toBe('/api/comments/c%2F1');
  });

  it('reads the client scope only (C6), and pages it; posts to the plain route', () => {
    expect(ownerClientThreadPath('n-1')).toBe('/api/nodes/n-1/comments?scope=client');
    expect(ownerClientThreadPath('../chat')).toBe('/api/nodes/..%2Fchat/comments?scope=client');
    expect(threadPagePath(ownerClientThreadPath('n-1'), '2026-09-30T08:00:00.000Z')).toBe(
      '/api/nodes/n-1/comments?scope=client&before=2026-09-30T08%3A00%3A00.000Z',
    );
    expect(ownerThreadPath('n-1')).not.toContain('scope');
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
