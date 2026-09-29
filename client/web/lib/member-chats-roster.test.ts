import { describe, expect, it } from 'vitest';
import type { MemberChatRow } from '@mantle/client-types';
import {
  CHAT_ROSTER_FILTERS,
  chatRosterEmptyText,
  chatRosterTag,
  chatRowMetaTag,
  filterChatRoster,
  isClientChat,
} from './member-chats-roster';

/** Member chats (client logins audit B26): a client row is a Client. */
describe('chatRosterTag', () => {
  it('a client is a Client, never "no longer a member"', () => {
    expect(chatRosterTag({ role: 'client', active: true })).toBe('Client');
    expect(chatRosterTag({ role: 'client', active: false })).toBe('Client, disabled');
  });

  it('a member: nothing while active, else no longer a member', () => {
    expect(chatRosterTag({ role: 'member', active: true })).toBeNull();
    expect(chatRosterTag({ role: 'member', active: false })).toBe('no longer a member');
    // A brain that does not say the role: as before.
    expect(chatRosterTag({ active: false })).toBe('no longer a member');
  });

  it('the Member chats tab labels rows and the open thread with it', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const page = readFileSync(
      fileURLToPath(new URL('../app/(app)/team-admin/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(page).not.toContain("'no longer a member");
    expect(page).not.toContain("' · no longer a member'");
    // A row: the Client badge beside the name, and the meta tag before the
    // last message (C4); the open thread's header: the roster tag.
    expect(page).toMatch(/\{chatRowMetaTag\(m\) \? `\$\{chatRowMetaTag\(m\)\} · ` : ''\}/);
    expect(page).toMatch(/\{isClientChat\(m\) \? \(\s*<Badge[^>]*>\s*Client\s*<\/Badge>/);
    expect(page).toContain('const rosterTag = member ? chatRosterTag(member) : null;');
  });
});

type Row = Pick<MemberChatRow, 'loginId' | 'role' | 'active'>;
const roster: Row[] = [
  { loginId: 'm-1', role: 'member', active: true },
  { loginId: 'c-1', role: 'client', active: true },
  // A brain that does not say the role: a member's row.
  { loginId: 'x-1', active: false },
  { loginId: 'c-2', role: 'client', active: false },
];
const ids = (rows: Row[]) => rows.map((r) => r.loginId);

/** Member chats (client logins C4): All, Members, Clients. */
describe('filterChatRoster', () => {
  it('All keeps every row, in order', () => {
    expect(ids(filterChatRoster(roster, 'all'))).toEqual(['m-1', 'c-1', 'x-1', 'c-2']);
  });

  it('Members keeps member rows, and rows with no role', () => {
    expect(ids(filterChatRoster(roster, 'members'))).toEqual(['m-1', 'x-1']);
  });

  it('Clients keeps client rows only', () => {
    expect(ids(filterChatRoster(roster, 'clients'))).toEqual(['c-1', 'c-2']);
  });

  it('offers the three, All first', () => {
    expect(CHAT_ROSTER_FILTERS.map((f) => f.label)).toEqual(['All', 'Members', 'Clients']);
  });

  it('an empty filter says which', () => {
    expect(chatRosterEmptyText('clients')).toBe('No client has chatted yet.');
    expect(chatRosterEmptyText('members')).toBe('No member chats here.');
  });
});

describe('a roster row', () => {
  it('a client wears the badge, and its meta says only disabled', () => {
    expect(isClientChat({ role: 'client' })).toBe(true);
    expect(isClientChat({ role: 'member' })).toBe(false);
    expect(isClientChat({})).toBe(false);
    expect(chatRowMetaTag({ role: 'client', active: true })).toBeNull();
    expect(chatRowMetaTag({ role: 'client', active: false })).toBe('disabled');
  });

  it('a member row keeps its tag', () => {
    expect(chatRowMetaTag({ role: 'member', active: true })).toBeNull();
    expect(chatRowMetaTag({ role: 'member', active: false })).toBe('no longer a member');
  });
});
