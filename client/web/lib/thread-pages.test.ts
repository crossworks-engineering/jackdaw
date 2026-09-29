import { describe, expect, it } from 'vitest';
import { olderCursor, threadComments, threadPagePath } from './thread-pages';

/**
 * Paged comment threads (client logins C5 audit fixes, contract section 1):
 * the newest page, then each older one from the oldest comment shown; a
 * brain without `hasMore` is one page.
 */
const c = (id: string, createdAt = `2026-09-29T10:00:0${id}.000Z`) => ({ id, createdAt });

describe('threadPagePath', () => {
  it('asks the newest page with no cursor', () => {
    expect(threadPagePath('/api/nodes/n-1/comments')).toBe('/api/nodes/n-1/comments');
    expect(threadPagePath('/api/nodes/n-1/comments', null)).toBe('/api/nodes/n-1/comments');
  });

  it('asks the page before the oldest shown, encoded', () => {
    expect(threadPagePath('/api/x/comments', '2026-09-29T10:00:00.000Z')).toBe(
      '/api/x/comments?before=2026-09-29T10%3A00%3A00.000Z',
    );
    expect(threadPagePath('/api/x/comments?days=7', 'a+b')).toBe(
      '/api/x/comments?days=7&before=a%2Bb',
    );
  });
});

describe('olderCursor', () => {
  it('is the oldest comment of a page with more before it', () => {
    expect(olderCursor({ comments: [c('1'), c('2')], hasMore: true })).toBe(
      '2026-09-29T10:00:01.000Z',
    );
  });

  it('is nothing on the oldest page, or from a brain that does not page', () => {
    expect(olderCursor({ comments: [c('1')], hasMore: false })).toBeUndefined();
    expect(olderCursor({ comments: [c('1')] })).toBeUndefined();
    expect(olderCursor({ comments: [], hasMore: true })).toBeUndefined();
  });
});

describe('threadComments', () => {
  it('reads the pages oldest first: the older pages before the newest', () => {
    const newest = { comments: [c('3'), c('4')], hasMore: true };
    const older = { comments: [c('1'), c('2')], hasMore: false };
    expect(threadComments([newest, older]).map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('shows a comment that sits in two pages once', () => {
    const newest = { comments: [c('2'), c('3')], hasMore: true };
    const older = { comments: [c('1'), c('2')] };
    expect(threadComments([newest, older]).map((x) => x.id)).toEqual(['1', '2', '3']);
  });

  it('is empty with no pages', () => {
    expect(threadComments([])).toEqual([]);
  });
});
