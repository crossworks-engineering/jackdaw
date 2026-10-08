/**
 * One switch, two meanings (brain team apps Phase 2): a connector tool's
 * read-only mark, an http tool's External access.
 */
import { describe, expect, it } from 'vitest';
import { blockedReason, toolAccessBadge, toolAccessCopy } from './tool-access-copy';
import {
  CONNECTOR_LEVEL_MEANING,
  connectorLevelConfirmNote,
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
    expect(
      isConnectorGroup({ integration: { openapi: { url: 'https://x.example/o.json' } } } as never),
    ).toBe(false);
    expect(isConnectorGroup({})).toBe(false);
    expect(groupLevelMeaning(connector, 'team')).toBe(CONNECTOR_LEVEL_MEANING.team);
    expect(groupLevelMeaning(connector, 'team')).toMatch(/own MCP/);
    expect(groupLevelMeaning(plain, 'team')).not.toMatch(/own MCP/);
    for (const m of Object.values(CONNECTOR_LEVEL_MEANING)) expect(m).not.toMatch(DASHES);
  });

  it('tells public agents and contacts they get only read-only tools', () => {
    expect(CONNECTOR_LEVEL_MEANING.public).toMatch(/public agents/);
    expect(CONNECTOR_LEVEL_MEANING.public).toMatch(/only its read-only tools/);
    // A client never reaches a public connector, and a client agent's grant
    // gives clients nothing (access matrix N10).
    expect(CONNECTOR_LEVEL_MEANING.public).toMatch(/Not clients/);
    expect(CONNECTOR_LEVEL_MEANING.client).not.toMatch(/client agents/);
    expect(connectorLevelConfirmNote('public')).toMatch(/only the tools marked read-only/);
    expect(connectorLevelConfirmNote('team')).not.toMatch(/public agents/);
    expect(toolAccessCopy('mcp').hint).toMatch(
      /Contacts and public agents only ever get marked tools/,
    );
    expect(toolAccessCopy('mcp').dialogBody[0]).toMatch(/public agents get it too/);
    for (const l of ['admin', 'team', 'client', 'public'] as const) {
      expect(connectorLevelConfirmNote(l)).not.toMatch(DASHES);
    }
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
      '3 read tools; 1 tool that changes data needs the Write switch on your MCP',
    );
    expect(connectorLine({ ...c, writeTools: 0 }, false)).toBe('3 read tools');
  });
});

describe('the tag on a tool in the list', () => {
  const mcp = { handler: { kind: 'mcp' } };
  it('shows a marked connector tool as read-only, an unmarked one as writes', () => {
    expect(toolAccessBadge({ ...mcp, externalAccess: { on: true } })).toMatchObject({
      label: 'read-only',
      tone: 'neutral',
    });
    expect(toolAccessBadge(mcp)).toMatchObject({ label: 'writes', tone: 'warning' });
    expect(toolAccessBadge({ ...mcp, externalAccess: { on: false } })).toMatchObject({
      label: 'changed',
      tone: 'warning',
    });
  });

  it('keeps External access on an http tool, and no tag on others', () => {
    expect(
      toolAccessBadge({ handler: { kind: 'http' }, externalAccess: { on: true } }),
    ).toMatchObject({
      label: 'external',
    });
    expect(toolAccessBadge({ handler: { kind: 'http' } })).toBeNull();
    expect(toolAccessBadge({ handler: { kind: 'builtin' } })).toBeNull();
  });

  it('carries no dash', () => {
    for (const t of [
      mcp,
      { ...mcp, externalAccess: { on: true } },
      { ...mcp, externalAccess: { on: false } },
    ]) {
      const b = toolAccessBadge(t);
      expect(b?.title).not.toMatch(DASHES);
    }
  });
});

describe('why the switch is blocked', () => {
  it('names the mark on a connector tool and External access on an http tool', () => {
    expect(blockedReason({ handler: { kind: 'mcp' }, requiresConfirm: true })).toMatch(
      /can’t be marked read-only/,
    );
    expect(
      blockedReason({ handler: { kind: 'http', method: 'GET' }, requiresConfirm: true }),
    ).toMatch(/External access/);
    expect(blockedReason({ handler: { kind: 'http', method: 'DELETE' } })).toMatch(/sends DELETE/);
    expect(blockedReason({ handler: { kind: 'mcp' } })).toBeNull();
  });
});
