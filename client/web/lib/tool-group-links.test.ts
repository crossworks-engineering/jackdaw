import { describe, expect, it } from 'vitest';
import {
  connectorOff,
  groupsHolding,
  isConnectorGroup,
  toolGroupHref,
  type ToolGroupRow,
} from './tool-group-links';

const group = (p: Partial<ToolGroupRow> & { slug: string }): ToolGroupRow => ({
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

describe('isConnectorGroup', () => {
  it('is true for an MCP connector only', () => {
    expect(isConnectorGroup({ integration: { mcp: { url: 'https://x.example/mcp' } } })).toBe(true);
    expect(isConnectorGroup({ integration: null })).toBe(false);
    expect(isConnectorGroup({})).toBe(false);
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
