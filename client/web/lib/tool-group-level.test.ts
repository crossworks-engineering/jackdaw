import { describe, expect, it } from 'vitest';
import {
  groupsHolding,
  levelNeedsConfirm,
  connectorOff,
  toolGroupHref,
  type ToolGroupWithLevel,
} from './tool-group-level';

const group = (p: Partial<ToolGroupWithLevel> & { slug: string }): ToolGroupWithLevel => ({
  id: p.slug,
  name: p.slug,
  description: '',
  toolSlugs: ['site_query'],
  integration: null,
  enabled: true,
  createdAt: '',
  updatedAt: '',
  grantedTo: [],
  ...p,
});

describe('levelNeedsConfirm', () => {
  it('asks before client or public, never before admin or team, never for no change', () => {
    expect(levelNeedsConfirm('admin', 'client')).toBe(true);
    expect(levelNeedsConfirm('team', 'public')).toBe(true);
    expect(levelNeedsConfirm(undefined, 'client')).toBe(true);
    expect(levelNeedsConfirm('client', 'team')).toBe(false);
    expect(levelNeedsConfirm('team', 'admin')).toBe(false);
    expect(levelNeedsConfirm('client', 'client')).toBe(false);
  });
});

describe('groupsHolding', () => {
  it('lists only the groups with the tool, enabled first, then by name', () => {
    const got = groupsHolding(
      [
        group({ slug: 'b-off', enabled: false }),
        group({ slug: 'z-on' }),
        group({ slug: 'a-on' }),
        group({ slug: 'other', toolSlugs: ['x'] }),
      ],
      'site_query',
    );
    expect(got.map((g) => g.slug)).toEqual(['a-on', 'z-on', 'b-off']);
  });
});

describe('connectorOff', () => {
  const mcp = { kind: 'mcp', group: 'mcp-site' };
  it('names the connector group of an MCP tool when it is switched off', () => {
    expect(connectorOff([group({ slug: 'mcp-site', enabled: false })], mcp)?.slug).toBe('mcp-site');
  });

  it('is null when the connector is on, missing, or the tool is not MCP', () => {
    expect(connectorOff([group({ slug: 'mcp-site' })], mcp)).toBeNull();
    expect(connectorOff([], mcp)).toBeNull();
    expect(
      connectorOff([group({ slug: 'mcp-site', enabled: false })], { kind: 'http' }),
    ).toBeNull();
  });
});

describe('toolGroupHref', () => {
  it('opens the tool groups screen on the group', () => {
    expect(toolGroupHref('mcp-site')).toBe('/settings/tool-groups?selected=mcp-site');
  });
});
