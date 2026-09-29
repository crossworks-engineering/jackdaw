import { describe, expect, it } from 'vitest';
import { chatRosterTag } from './member-chats-roster';

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
    expect(page).toMatch(/\{chatRosterTag\(m\) \? `\$\{chatRosterTag\(m\)\} · ` : ''\}/);
    expect(page).toContain('const rosterTag = member ? chatRosterTag(member) : null;');
  });
});
