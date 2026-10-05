import { describe, expect, it } from 'vitest';
import { Bot, type LucideIcon } from 'lucide-react';
import { NAV_GROUPS as SHARED_NAV_GROUPS } from '@mantle/share-ui/nav-items';
import {
  ALL_NAV_ITEMS,
  NAV_GROUPS,
  matchNavItem,
  withAdded,
  withoutRetired,
  type NavGroup,
} from './nav-items';

/** The retired team portal (member logins Phase 6) must not be a sidebar row,
 *  a palette entry or a usage-ranking target while the shared list still
 *  names it. */
const icon = Bot as LucideIcon;
const hrefs = (groups: NavGroup[]) => groups.flatMap((g) => g.items).map((i) => i.href);

describe('nav items without retired screens', () => {
  it('drops /team-portal from the groups, the flat list and the matcher', () => {
    expect(hrefs(NAV_GROUPS)).not.toContain('/team-portal');
    expect(ALL_NAV_ITEMS.map((i) => i.href)).not.toContain('/team-portal');
    expect(matchNavItem('/team-portal')).toBeUndefined();
  });

  it('keeps everything else the shared list has, in order', () => {
    const shared = hrefs(SHARED_NAV_GROUPS).filter((h) => h !== '/team-portal');
    expect(hrefs(NAV_GROUPS).filter((h) => h !== '/settings/services')).toEqual(
      shared.filter((h) => h !== '/settings/services'),
    );
    expect(matchNavItem('/team-admin')?.href).toBe('/team-admin');
  });

  it('drops a group left empty and a retired href from a cold-start head', () => {
    const groups: NavGroup[] = [
      { label: 'Gone', items: [{ name: 'Portal', href: '/team-portal', icon }] },
      {
        label: 'Kept',
        collapsible: true,
        defaultHead: ['/team-portal', '/tasks'],
        items: [
          { name: 'Portal', href: '/team-portal', icon },
          { name: 'Tasks', href: '/tasks', icon },
        ],
      },
    ];
    const out = withoutRetired(groups);
    expect(out.map((g) => g.label)).toEqual(['Kept']);
    expect(out[0]!.defaultHead).toEqual(['/tasks']);
    expect(hrefs(out)).toEqual(['/tasks']);
  });
});

describe('nav items this client adds before the shared list names them', () => {
  it('Settings > Services is in the Settings group, once, right after Updates', () => {
    const settings = NAV_GROUPS.find((g) => g.label === 'Settings')!;
    const list = settings.items.map((i) => i.href);
    expect(list.filter((h) => h === '/settings/services')).toHaveLength(1);
    expect(list[list.indexOf('/settings/updates') + 1]).toBe('/settings/services');
    expect(matchNavItem('/settings/services')?.name).toBe('Services');
  });

  const groups: NavGroup[] = [
    {
      label: 'Settings',
      items: [
        { name: 'Backups', href: '/settings/backups', icon },
        { name: 'Updates', href: '/settings/updates', icon },
        { name: 'Logins', href: '/settings/users', icon },
      ],
    },
  ];

  it('places an entry after its anchor', () => {
    expect(hrefs(withAdded(groups))).toEqual([
      '/settings/backups',
      '/settings/updates',
      '/settings/services',
      '/settings/users',
    ]);
  });

  it('is a no-op once the shared list carries the href', () => {
    const carried: NavGroup[] = [
      {
        label: 'Settings',
        items: [...groups[0]!.items, { name: 'Services', href: '/settings/services', icon }],
      },
    ];
    expect(withAdded(carried)).toEqual(carried);
  });

  it('appends when the anchor is gone, and leaves other groups alone', () => {
    const noAnchor: NavGroup[] = [
      { label: 'Settings', items: [{ name: 'Backups', href: '/settings/backups', icon }] },
      { label: 'System', items: [{ name: 'Debug', href: '/debug', icon }] },
    ];
    expect(hrefs(withAdded(noAnchor))).toEqual([
      '/settings/backups',
      '/settings/services',
      '/debug',
    ]);
  });
});
