/**
 * One switch, two meanings (brain team apps Phase 2): a connector tool's
 * read-only mark, an http tool's External access.
 */
import { describe, expect, it } from 'vitest';
import { blockedReason, toolAccessBadge, toolAccessCopy } from './tool-access-copy';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('the switch on an outside tool', () => {
  it('is the read-only mark on a connector tool', () => {
    const c = toolAccessCopy('mcp');
    expect(c.label).toBe('Read-only');
    // Contract 28: workspaces decide who uses a connector, not its level.
    expect(c.hint).toMatch(/workspace screen/);
    expect(c.hint).not.toMatch(/level/);
    // W7b: no per-login Write switch on MCP any more.
    for (const t of [c.hint, ...c.dialogBody]) expect(t).not.toMatch(/Write switch/);
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
