/**
 * One switch, two meanings (brain team apps Phase 2): a connector tool's
 * read-only mark, an http tool's External access.
 */
import { describe, expect, it } from 'vitest';
import { toolAccessCopy } from './tool-access-copy';
import {
  CONNECTOR_LEVEL_MEANING,
  connectorLevelNeedsConfirm,
  groupLevelMeaning,
  isConnectorGroup,
} from './tool-group-level';
import { connectorLine } from './member-mcp';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('the switch on an outside tool', () => {
  it('is the read-only mark on a connector tool', () => {
    const c = toolAccessCopy('mcp');
    expect(c.label).toBe('Read-only');
    expect(c.hint).toMatch(/connector's level/);
    expect(c.hint).toMatch(/Write switch/);
    expect(c.dialogTitle('mcp_x_q')).toBe('Mark “mcp_x_q” as read-only?');
  });

  it('is External access on an http tool', () => {
    const c = toolAccessCopy('http');
    expect(c.label).toBe('External access');
    expect(c.action).toBe('Give External access');
  });

  it('carries no dash', () => {
    for (const k of ['mcp', 'http']) {
      const c = toolAccessCopy(k);
      for (const t of [
        c.label,
        c.hint,
        c.warn,
        c.stale,
        c.action,
        c.toastOn,
        c.toastOff,
        ...c.dialogBody,
      ]) {
        expect(t, t).not.toMatch(DASHES);
      }
    }
  });
});

describe("a connector group's level", () => {
  const connector = { integration: { mcp: { url: 'https://x.example/mcp' } } };
  const plain = { integration: null };

  it('says who uses the connector, and a plain group keeps its words', () => {
    expect(isConnectorGroup(connector)).toBe(true);
    expect(isConnectorGroup(plain)).toBe(false);
    expect(groupLevelMeaning(connector, 'team')).toBe(CONNECTOR_LEVEL_MEANING.team);
    expect(groupLevelMeaning(connector, 'team')).toMatch(/own MCP/);
    expect(groupLevelMeaning(plain, 'team')).not.toMatch(/own MCP/);
    for (const m of Object.values(CONNECTOR_LEVEL_MEANING)) expect(m).not.toMatch(DASHES);
  });

  it('asks before every move below admin', () => {
    expect(connectorLevelNeedsConfirm('admin', 'team')).toBe(true);
    expect(connectorLevelNeedsConfirm('team', 'client')).toBe(true);
    expect(connectorLevelNeedsConfirm('team', 'admin')).toBe(false);
    expect(connectorLevelNeedsConfirm('team', 'team')).toBe(false);
  });
});

describe('a connector on the member MCP screen', () => {
  it('names its reads, and its writes with the Write switch', () => {
    const c = { id: 'g', name: 'Site data', level: 'team', readTools: 3, writeTools: 1 };
    expect(connectorLine(c, true)).toBe('3 read tools, 1 tool that changes data');
    expect(connectorLine({ ...c, writeTools: 2 }, true)).toBe(
      '3 read tools, 2 tools that change data',
    );
    expect(connectorLine(c, false)).toBe(
      '3 read tools; 1 tool that changes data needs your Write switch',
    );
    expect(connectorLine({ ...c, writeTools: 0 }, false)).toBe('3 read tools');
  });
});
