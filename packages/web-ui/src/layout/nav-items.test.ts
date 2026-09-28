import { describe, expect, it } from 'vitest';
import { Bot, type LucideIcon } from 'lucide-react';
import { NAV_GROUPS as SHARED_NAV_GROUPS } from '@mantle/share-ui/nav-items';
import {
  ALL_NAV_ITEMS,
  NAV_GROUPS,
  matchNavItem,
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
    expect(hrefs(NAV_GROUPS)).toEqual(hrefs(SHARED_NAV_GROUPS).filter((h) => h !== '/team-portal'));
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
