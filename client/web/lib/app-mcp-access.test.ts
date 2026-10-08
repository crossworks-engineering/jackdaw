import { describe, expect, it } from 'vitest';
import {
  APP_MCP_ACCESS_HINT,
  APP_MCP_ACCESS_LABEL,
  isMcpAccessOn,
  mcpAccessPatch,
  supportsMcpAccess,
} from './app-mcp-access';

/**
 * MCP access on an app (brain team apps Phase 1): shown only by a brain that
 * knows the flag and on an app someone besides an admin runs; on only when
 * the brain says so; the switch sends the flag the owner app route takes.
 */
/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('MCP access on an app', () => {
  it('is on only when the brain says so', () => {
    expect(isMcpAccessOn({ mcpAccess: true })).toBe(true);
    expect(isMcpAccessOn({ mcpAccess: false })).toBe(false);
    expect(isMcpAccessOn({})).toBe(false);
    expect(isMcpAccessOn(null)).toBe(false);
  });

  it('shows the switch on a team, client or public app, or one shared through a folder', () => {
    for (const audience of ['team', 'client', 'public']) {
      expect(supportsMcpAccess({ mcpAccess: false, audience }), audience).toBe(true);
    }
    expect(supportsMcpAccess({ mcpAccess: false, audience: 'admin', inherited: 'team' })).toBe(
      true,
    );
    // Off on an admin app: nothing to show.
    expect(supportsMcpAccess({ mcpAccess: false, audience: 'admin' })).toBe(false);
    // Still on after the app moved back to admin: shown, so it can be turned
    // off before a re-share quietly opens MCP again (M1 audit, low 2).
    expect(supportsMcpAccess({ mcpAccess: true, audience: 'admin' })).toBe(true);
    // A brain before Phase 1 sends no flag.
    expect(supportsMcpAccess({ audience: 'team' })).toBe(false);
  });

  it('says members never write a public app, and clients reach client apps only', () => {
    expect(APP_MCP_ACCESS_HINT).toMatch(/public/);
    expect(APP_MCP_ACCESS_HINT).toMatch(/clients on a client app/);
  });

  it('sends the owner app patch, in words with no dash', () => {
    expect(mcpAccessPatch(true)).toEqual({ mcpAccess: true });
    expect(mcpAccessPatch(false)).toEqual({ mcpAccess: false });
    expect(APP_MCP_ACCESS_LABEL).toMatch(/^MCP access: /);
    expect(APP_MCP_ACCESS_LABEL).not.toMatch(DASHES);
    expect(APP_MCP_ACCESS_HINT).not.toMatch(DASHES);
  });
});
