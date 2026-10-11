/**
 * A login's unread badge comes from its own threads (W7c): GET
 * /api/assistant/conversations and POST /api/assistant/read, never the
 * retired /api/member/chat/unread.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONVERSATIONS_PATH,
  READ_PATH,
  THREAD_STREAM_PATH,
  hasUnread,
  pingChangesUnread,
  readBody,
  unreadTotal,
} from './assistant-unread';

const row = (slug: string, unreadCount: unknown) => ({ slug, unreadCount: unreadCount as number });

describe('the source of the unread badge', () => {
  it('reads the login own threads, never the retired member routes', () => {
    expect(CONVERSATIONS_PATH).toBe('/api/assistant/conversations');
    expect(READ_PATH).toBe('/api/assistant/read');
    expect(THREAD_STREAM_PATH).toBe('/api/assistant/stream');
    for (const p of [CONVERSATIONS_PATH, READ_PATH, THREAD_STREAM_PATH]) {
      expect(p).not.toMatch(/\/api\/member\//);
    }
  });

  it('the hook reads those routes and no member chat route', () => {
    const hook = readFileSync(
      fileURLToPath(new URL('../components/assistant/use-assistant-unread.ts', import.meta.url)),
      'utf8',
    );
    expect(hook).toContain('CONVERSATIONS_PATH');
    expect(hook).toContain('READ_PATH');
    expect(hook).toContain('THREAD_STREAM_PATH');
    expect(hook).not.toMatch(/member\/chat/);
  });
});

describe('unreadTotal', () => {
  it('sums the unread replies of every own thread', () => {
    expect(unreadTotal([row('a', 2), row('b', 0), row('c', 3)])).toBe(5);
  });

  it('counts nothing for no rows, or a count that is not a whole positive number', () => {
    expect(unreadTotal(undefined)).toBe(0);
    expect(unreadTotal([])).toBe(0);
    expect(unreadTotal([row('a', -1), row('b', 'x'), row('c', NaN), row('d', 1.7)])).toBe(1);
  });
});

describe('hasUnread', () => {
  it('is true for the shown thread with unread replies only', () => {
    const list = [row('team', 2), row('admin', 0)];
    expect(hasUnread(list, 'team')).toBe(true);
    expect(hasUnread(list, 'admin')).toBe(false);
    expect(hasUnread(list, 'other')).toBe(false);
    expect(hasUnread(list, null)).toBe(false);
    expect(hasUnread(undefined, 'team')).toBe(false);
  });
});

describe('a ping of the thread stream', () => {
  it('a reply refreshes the badge; the login own message does not', () => {
    expect(pingChangesUnread(JSON.stringify({ agentSlug: 'team', direction: 'outbound' }))).toBe(
      true,
    );
    expect(pingChangesUnread(JSON.stringify({ agentSlug: 'team', direction: 'inbound' }))).toBe(
      false,
    );
  });

  it('a ping that cannot be read refreshes it rather than leave it stale', () => {
    expect(pingChangesUnread('not json')).toBe(true);
    expect(pingChangesUnread('{}')).toBe(true);
  });
});

describe('readBody', () => {
  it('names the thread to mark read', () => {
    expect(readBody('team')).toEqual({ agentSlug: 'team' });
  });
});
