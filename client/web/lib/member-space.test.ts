import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { refusalMessage, workspaceQuery } from './member-space';

describe('workspaceQuery', () => {
  it('Close drops the id a redirect wrote as ?selected= (and its edit flag)', () => {
    expect(workspaceQuery('selected=n1&edit=1', { id: null })).toBe('');
  });

  it('switching the source closes the item whichever key opened it', () => {
    expect(workspaceQuery('selected=n1&edit=1', { src: 'team', id: null })).toBe('src=team');
    expect(workspaceQuery('id=n1', { src: 'library', id: null })).toBe('src=library');
  });

  it('opening an item replaces a redirect selection with ?id=', () => {
    expect(workspaceQuery('selected=n1&edit=1', { id: 'n2' })).toBe('id=n2');
  });

  it('a source change alone keeps the open item and other params', () => {
    expect(workspaceQuery('id=n1&q=x', { src: 'mine' })).toBe('id=n1&q=x');
  });
});

describe('refusalMessage', () => {
  it("prefers the brain's own sentence", () => {
    const err = new ApiError('Your space holds 2 GB.', 409, {
      error: 'Your space holds 2 GB.',
      reason: 'quota',
    });
    expect(refusalMessage(err)).toBe('Your space holds 2 GB.');
  });

  it('names quota, embed and rate limits when the brain sent no sentence', () => {
    expect(refusalMessage(new ApiError('409 Conflict', 409, { reason: 'quota' }))).toMatch(
      /space is full/,
    );
    expect(
      refusalMessage(new ApiError('409 Conflict', 409, { reason: 'embed', ids: ['x'] })),
    ).toMatch(/cannot share/);
    expect(refusalMessage(new ApiError('429', 429, { error: 'rate-limit' }))).toMatch(
      /Too many requests/,
    );
    expect(refusalMessage(new ApiError('429', 429, { reason: 'rate-limit' }))).toMatch(
      /Too many requests/,
    );
  });

  it('leaves the fallback to the caller otherwise', () => {
    expect(refusalMessage(new ApiError('forbidden', 403, { error: 'forbidden' }))).toBeNull();
    expect(refusalMessage(new TypeError('Failed to fetch'))).toBeNull();
  });
});
