import { describe, expect, it } from 'vitest';
import { workspaceQuery } from './member-space';

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
