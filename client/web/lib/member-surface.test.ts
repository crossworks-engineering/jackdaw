/**
 * The owner-shell screens a member may open besides their own: API access
 * (their own API keys), exactly, and nothing that only starts like it.
 */
import { describe, expect, it } from 'vitest';
import { memberMayOpen, sendsMemberHome } from './member-surface';

describe('memberMayOpen: shared screens', () => {
  it('opens API access to a member', () => {
    expect(memberMayOpen('/settings/api-access')).toBe(true);
    expect(sendsMemberHome('/settings/api-access', [])).toBe(false);
  });

  it('keeps every other settings screen, and look-alikes, closed', () => {
    for (const path of [
      '/settings/api-accessx',
      '/settings/api',
      '/settings/profile',
      '/settings/keys',
      '/settings/mcp',
      '/settings',
    ]) {
      expect(memberMayOpen(path), path).toBe(false);
    }
  });
});
