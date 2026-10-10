/**
 * One switch, two meanings (brain team apps Phase 2): a connector tool's
 * read-only mark, an http tool's External access.
 */
import { describe, expect, it } from 'vitest';
import { blockedReason, toolAccessBadge, toolAccessCopy } from './tool-access-copy';
import {
  CONNECTOR_WORKSPACES_NOTE,
  GROUP_LEVEL_MEANING,
  groupLevelMeaning,
  isConnectorGroup,
  levelNeedsConfirm,
} from './tool-group-level';
import { connectorLine } from './member-mcp';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('the switch on an outside tool', () => {
  it('is the read-only mark on a connector tool', () => {
    const c = toolAccessCopy('mcp');
    expect(c.label).toBe('Read-only');
    // Contract 28: workspaces decide who uses a connector, not its level.
    expect(c.hint).toMatch(/workspace screen/);
    expect(c.hint).not.toMatch(/level/);
    expect(c.hint).toMatch(/Write switch/);
    for (const t of [c.hint, c.warn, c.stale, ...c.dialogBody]) {
      expect(t).not.toMatch(/connector.s level|public agents|contact link/);
    }
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

  it('says the workspaces share a connector, not its level (contracts 21, 28)', () => {
    expect(isConnectorGroup(connector)).toBe(true);
    expect(isConnectorGroup(plain)).toBe(false);
    expect(
      isConnectorGroup({ integration: { openapi: { url: 'https://x.example/o.json' } } } as never),
    ).toBe(false);
    expect(isConnectorGroup({})).toBe(false);
    expect(groupLevelMeaning(connector, 'team')).toBe(
      `${GROUP_LEVEL_MEANING.team} ${CONNECTOR_WORKSPACES_NOTE}`,
    );
    expect(groupLevelMeaning(connector, 'team')).not.toMatch(/own MCP/);
    expect(groupLevelMeaning(plain, 'team')).toBe(GROUP_LEVEL_MEANING.team);
    expect(CONNECTOR_WORKSPACES_NOTE).not.toMatch(DASHES);
  });

  it('asks before client or public only, connector or not', () => {
    expect(levelNeedsConfirm('admin', 'team')).toBe(false);
    expect(levelNeedsConfirm('team', 'client')).toBe(true);
    expect(levelNeedsConfirm('team', 'public')).toBe(true);
    expect(levelNeedsConfirm('team', 'team')).toBe(false);
  });
});

describe('a connector on the member MCP screen', () => {
  it('names its reads, and its writes with the Write switch', () => {
    // No `level` since W5b2 (contract 28).
    const c = { id: 'g', name: 'Site data', readTools: 3, writeTools: 1 };
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
