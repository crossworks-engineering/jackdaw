/**
 * Settings > MCP, one screen for every user (W7b): which side a login reads,
 * the two routes as one view, the paths, the words and the connect commands.
 */
import { describe, expect, it } from 'vitest';
import {
  READ_LINE,
  WRITE_LINE,
  claudeCodeKeyCommand,
  claudeCodeOauthCommand,
  connectorLine,
  mcpClientPath,
  mcpClientsText,
  mcpOffText,
  mcpScreenView,
  mcpSourceFor,
  mcpViewPath,
} from './mcp-screen';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const client = {
  id: 'c1',
  clientName: 'Claude',
  connectedAt: '2026-10-01T08:00:00.000Z',
  lastUsedAt: null,
  activeTokens: 1,
};

describe('which side of the one MCP screen a login reads', () => {
  it('the brain side for an admin with Settings, its own for a member', () => {
    expect(mcpSourceFor('admin', true)).toBe('brain');
    expect(mcpSourceFor('member', false)).toBe('own');
    expect(mcpSourceFor('member', true)).toBe('own');
  });

  it('an admin without Settings is refused, no shell waits', () => {
    expect(mcpSourceFor('admin', false)).toBe('refused');
    expect(mcpSourceFor(null, true)).toBeNull();
  });

  it('each side reads its own route', () => {
    expect(mcpViewPath('brain')).toBe('/api/mcp-settings');
    expect(mcpViewPath('own')).toBe('/api/member/mcp');
  });
});

describe('the two answers as one view', () => {
  it('the brain side: the box switch, the URL and every client', () => {
    const v = mcpScreenView('brain', {
      enabled: true,
      connectorUrl: 'https://b.example/api/mcp',
      clients: [client],
    });
    expect(v).toEqual({
      source: 'brain',
      remoteEnabled: true,
      connectorUrl: 'https://b.example/api/mcp',
      clients: [client],
    });
  });

  it('the own side: no per-login switch is read, the data sources are kept', () => {
    const v = mcpScreenView('own', {
      remoteEnabled: false,
      connectorUrl: 'https://b.example/api/mcp',
      access: { enabled: false, writeEnabled: false },
      clients: [],
      connectors: [{ id: 'g', name: 'Site data', readTools: 2, writeTools: 0 }],
    });
    expect(v).not.toHaveProperty('access');
    expect(v.remoteEnabled).toBe(false);
    expect(v.connectors).toHaveLength(1);
    const before = mcpScreenView('own', {
      remoteEnabled: true,
      connectorUrl: 'u',
      access: { enabled: true, writeEnabled: true },
      clients: [],
    });
    expect(before).not.toHaveProperty('connectors');
  });
});

describe('paths and words', () => {
  it('disconnects on the side the client was listed', () => {
    expect(mcpClientPath('brain', 'a b')).toBe('/api/mcp-clients/a%20b');
    expect(mcpClientPath('own', 'a b')).toBe('/api/member/mcp/clients/a%20b');
  });

  it('says who turns MCP on, and whose clients are listed', () => {
    expect(mcpOffText('own')).toMatch(/An admin turns it on/);
    expect(mcpOffText('brain')).toMatch(/Turn it on/);
    expect(mcpClientsText('own').title).toBe('Your connected clients');
    expect(mcpClientsText('brain').title).toBe('Connected clients');
  });

  it('names no per-login switch and no retired tool', () => {
    const all = [
      READ_LINE,
      WRITE_LINE,
      mcpOffText('own'),
      mcpOffText('brain'),
      mcpClientsText('own').hint,
      mcpClientsText('brain').hint,
    ];
    for (const l of all) {
      expect(l).not.toMatch(/Write switch|off for your login|my_app|my_item/);
      expect(l).not.toMatch(DASHES);
    }
    expect(READ_LINE).toMatch(/your own work/);
  });

  it('a data source names its reads and its writes', () => {
    const c = { id: 'g', name: 'Site data', readTools: 3, writeTools: 1 };
    expect(connectorLine(c)).toBe('3 read tools, 1 tool that changes data');
    expect(connectorLine({ ...c, writeTools: 2 })).toBe('3 read tools, 2 tools that change data');
    expect(connectorLine({ ...c, readTools: 1, writeTools: 0 })).toBe('1 read tool');
  });

  it('builds the connect commands', () => {
    const url = 'https://brain.example/api/mcp';
    expect(claudeCodeOauthCommand(url)).toBe(`claude mcp add --transport http mantle ${url}`);
    expect(claudeCodeKeyCommand(url)).toContain('Authorization: Bearer mtlk_');
  });
});
