/**
 * A member's own Settings > MCP (brain team apps Phase 1): what their access
 * reads like, the paths, and the connect commands.
 */
import { describe, expect, it } from 'vitest';
import {
  MY_APP_LINES,
  READ_LINE,
  claudeCodeKeyCommand,
  claudeCodeOauthCommand,
  memberMcpAccessLines,
  memberMcpClientPath,
} from './member-mcp';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("a member's MCP view", () => {
  it('says MCP is off when the box or the login has it off', () => {
    const boxOff = memberMcpAccessLines({
      remoteEnabled: false,
      access: { enabled: true, writeEnabled: true },
    });
    expect(boxOff.state).toBe('off');
    expect(boxOff.lines.join(' ')).toMatch(/off on this brain/);
    const loginOff = memberMcpAccessLines({
      remoteEnabled: true,
      access: { enabled: false, writeEnabled: true },
    });
    expect(loginOff.state).toBe('off');
    expect(loginOff.lines.join(' ')).toMatch(/off for your login/);
  });

  it('reads only without Write, and names app data both ways', () => {
    const read = memberMcpAccessLines({
      remoteEnabled: true,
      access: { enabled: true, writeEnabled: false },
    });
    expect(read.state).toBe('read');
    expect(read.lines.join(' ')).toMatch(/cannot change anything/);
    expect(read.lines.join(' ')).toMatch(/mini apps/);
    const write = memberMcpAccessLines({
      remoteEnabled: true,
      access: { enabled: true, writeEnabled: true },
    });
    expect(write.state).toBe('write');
    expect(write.lines.join(' ')).toMatch(/change rows/);
    expect(write.lines.join(' ')).toMatch(/informational or public/);
    // No review since W5c: nothing is made for review, shared or submitted.
    for (const l of [...read.lines, ...write.lines]) {
      expect(l).not.toMatch(/review|submit|share/i);
    }
    expect(write.lines).toContain('You build your own mini apps with the my_app tools.');
    for (const l of [...read.lines, ...write.lines]) expect(l).not.toMatch(DASHES);
  });

  it('matches the W6b MCP tools: none retired, own work in the private workspace', () => {
    const write = memberMcpAccessLines({
      remoteEnabled: true,
      access: { enabled: true, writeEnabled: true },
    });
    const all = write.lines.join(' ');
    expect(all).not.toMatch(/my_items_list|my_item_open|my_app_unshare|my_item_submit/);
    expect(all).toMatch(/private workspace/);
    expect(all).toMatch(/Grant Access/);
    expect(all).toMatch(/my_app_undelete/);
    expect(READ_LINE).toMatch(/your own work/);
    for (const l of MY_APP_LINES) expect(l).not.toMatch(DASHES);
  });

  it('builds the disconnect path and the connect commands', () => {
    expect(memberMcpClientPath('a b')).toBe('/api/member/mcp/clients/a%20b');
    const url = 'https://brain.example/api/mcp';
    expect(claudeCodeOauthCommand(url)).toBe(`claude mcp add --transport http mantle ${url}`);
    expect(claudeCodeKeyCommand(url)).toContain('Authorization: Bearer mtlk_');
  });
});
