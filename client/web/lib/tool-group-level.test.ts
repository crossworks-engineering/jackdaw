import { describe, expect, it } from 'vitest';
import {
  groupsHolding,
  levelNeedsConfirm,
  teamAppsReach,
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

describe('teamAppsReach', () => {
  it('is yes when an enabled group at team level or lower holds the tool', () => {
    for (const audience of ['team', 'client', 'public'] as const) {
      expect(teamAppsReach([group({ slug: 'g', audience })], 'site_query')).toBe('yes');
    }
  });

  it('is no when only admin or disabled groups hold it, or none does', () => {
    expect(teamAppsReach([group({ slug: 'g', audience: 'admin' })], 'site_query')).toBe('no');
    expect(
      teamAppsReach([group({ slug: 'g', audience: 'team', enabled: false })], 'site_query'),
    ).toBe('no');
    expect(teamAppsReach([], 'site_query')).toBe('no');
  });

  it('is unknown when an enabled group has no level (an older brain)', () => {
    expect(teamAppsReach([group({ slug: 'g' })], 'site_query')).toBe('unknown');
    expect(
      teamAppsReach([group({ slug: 'g' }), group({ slug: 'h', audience: 'team' })], 'site_query'),
    ).toBe('yes');
  });
});

describe('toolGroupHref', () => {
  it('opens the tool groups screen on the group', () => {
    expect(toolGroupHref('mcp-site')).toBe('/settings/tool-groups?selected=mcp-site');
  });
});
