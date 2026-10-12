import { describe as suite, expect, it } from 'vitest';
import { describe, whoOf } from './access-log';

suite('access log row words', () => {
  it('a member opened the app; a team-link visitor entered a token', () => {
    expect(describe({ kind: 'auth', detail: { via: 'member' } }).label).toBe('Opened the app');
    // An old client login's frame ticket (before W8): its own login too.
    expect(describe({ kind: 'auth', detail: { via: 'client' } }).label).toBe('Opened the app');
    expect(describe({ kind: 'auth', detail: {} }).label).toBe('Entered their team token');
  });

  it('marks refused member calls', () => {
    expect(
      describe({ kind: 'tool', detail: { via: 'member', slug: 'x', refused: 'not-declared' } })
        .label,
    ).toBe('Used tool x (refused)');
    expect(
      describe({ kind: 'db', detail: { via: 'member', op: 'exec', refused: 'read-only' } }).label,
    ).toBe('Wrote to the app database (refused)');
    expect(describe({ kind: 'db', detail: { op: 'query' } }).label).toBe(
      'Queried the app database',
    );
  });
});

suite('access log row names (client tier audit I5)', () => {
  const row = (contactName: string | null, via?: string, contactId: string | null = null) => ({
    contactId,
    contactName,
    detail: via ? { via } : {},
  });

  it('the name the brain sends, whoever the row is', () => {
    expect(whoOf(row('Pat', 'client'))).toBe('Pat');
    expect(whoOf(row('Pat', 'member'))).toBe('Pat');
  });

  it('a deleted login is removed, never an anonymous visitor', () => {
    // An old client login's row (no client login since W8).
    expect(whoOf(row(null, 'client'))).toBe('Removed login');
    expect(whoOf(row(null, 'member'))).toBe('Removed member');
    expect(whoOf(row(null, undefined, 'c-1'))).toBe('Removed contact');
    expect(whoOf(row(null))).toBe('Anonymous (public link)');
  });
});

suite('access log row names: contact shares (brain migration 0214)', () => {
  it('names the contact a contact share was for, and a deleted one as removed', () => {
    const contact = { contactId: 'c-1', contactName: 'Ann', detail: { via: 'contact' } };
    expect(whoOf(contact)).toBe('Ann (contact share)');
    expect(whoOf({ ...contact, contactId: null, contactName: null })).toBe('Removed contact');
  });
});
