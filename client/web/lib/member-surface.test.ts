/**
 * The owner-shell screens a member may open besides their own: API access
 * (their own API keys) and MCP (their own view), exactly, and nothing that
 * only starts like them.
 */
import { describe, expect, it } from 'vitest';
import { memberMayOpen, sendsMemberHome } from './member-surface';

describe('memberMayOpen: shared screens', () => {
  it('opens API access to a member', () => {
    expect(memberMayOpen('/settings/api-access')).toBe(true);
    expect(sendsMemberHome('/settings/api-access', [])).toBe(false);
  });

  it('opens MCP to a member (their own view)', () => {
    expect(memberMayOpen('/settings/mcp')).toBe(true);
    expect(sendsMemberHome('/settings/mcp', [])).toBe(false);
  });

  it('keeps every other settings screen, and look-alikes, closed', () => {
    for (const path of [
      '/settings/api-accessx',
      '/settings/api',
      '/settings/profile',
      '/settings/keys',
      '/settings/mcpx',
      '/settings/peers',
      '/settings',
    ]) {
      expect(memberMayOpen(path), path).toBe(false);
    }
  });
});
