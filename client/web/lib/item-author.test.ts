import { describe, expect, it } from 'vitest';
import { authorBadgeText, authorName } from './item-author';

/**
 * An accepted item's author (client logins audit B26): a client is never
 * called a member.
 */
describe('item author', () => {
  it('a member: Member-authored, by name, "A member" without one', () => {
    expect(authorBadgeText({ name: 'Mia', role: 'member' })).toBe('Member-authored');
    expect(authorName({ name: 'Mia Member', role: 'member' })).toBe('Mia Member');
    expect(authorName({ name: 'A member', role: 'member' })).toBe('A member');
  });

  it('a client: Client-authored, and never "A member"', () => {
    expect(authorBadgeText({ name: 'A client', role: 'client' })).toBe('Client-authored');
    expect(authorName({ name: 'A client', role: 'client' })).toBe('A client');
    expect(authorName({ name: 'A member', role: 'client' })).toBe('A client');
    expect(authorName({ name: ' ', role: 'client' })).toBe('A client');
    expect(authorName({ name: 'Pat Client', role: 'client' })).toBe('Pat Client');
  });

  it('a brain that does not say the role: as before', () => {
    expect(authorBadgeText({ name: 'A member' })).toBe('Member-authored');
    expect(authorBadgeText({ name: 'A member', role: null })).toBe('Member-authored');
    expect(authorName({ name: 'A member' })).toBe('A member');
  });

  it('every screen that badges an author uses these', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const read = (rel: string) =>
      readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    for (const rel of ['../components/member/member-reader.tsx']) {
      const src = read(rel);
      expect(src, rel).not.toContain('Member-authored');
      expect(src, rel).toMatch(/authorBadgeText\(/);
      expect(src, rel).toMatch(/Written by \{authorName\(/);
    }
    // A client request above the member's tree names its author the same way.
    expect(read('../components/member/member-item-sections.tsx')).toMatch(
      /authorName\(row\.author\)/,
    );
  });
});
