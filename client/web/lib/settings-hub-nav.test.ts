import { describe, expect, it } from 'vitest';
import { Bot, type LucideIcon } from 'lucide-react';
import type { NavGroup } from '@mantle/web-ui/layout/nav-items';
import {
  collapseSettingsNav,
  expandSettingsNavForFilter,
  SETTINGS_HUB_HREF,
} from './settings-hub-nav';

/**
 * The collapse hides the hub screens from the rendered sidebar; the expand is
 * what the filter box searches instead. The regression these pin: typing
 * "backups" in the sidebar filter must find Backups again (it went dark when
 * the hub landed), and neither transform may double-insert a "Settings" row
 * once mantle ships the collapsed list itself.
 */

const icon = Bot as LucideIcon;

function settingsGroup(): NavGroup {
  return {
    label: 'Settings',
    collapsible: true,
    items: [
      { name: 'Accounts', href: '/settings/accounts', icon },
      { name: 'Backups', href: '/settings/backups', icon },
      { name: 'Appearance', href: '/settings/appearance', icon },
    ],
  };
}

function reviewGroup(): NavGroup {
  return {
    label: 'Review',
    collapsible: false,
    // `discover` lives under /settings/ but sits in Review. Its row is hidden
    // (the hub card is its one door now) — and hiding it must NOT plant a
    // "Settings" row in Review, the trap both transforms must not fall into.
    items: [
      { name: 'Models', href: '/models', icon },
      { name: 'Discover', href: '/settings/discover', icon },
    ],
  };
}

describe('collapseSettingsNav', () => {
  it('replaces the hub screens with one Settings row, keeps the rest', () => {
    const g = collapseSettingsNav([settingsGroup()])[0]!;
    expect(g.items.map((i) => i.href)).toEqual([SETTINGS_HUB_HREF, '/settings/accounts']);
  });

  it('hides the Discover row from Review without planting a Settings row there', () => {
    const g = collapseSettingsNav([reviewGroup()])[0]!;
    expect(g.items.map((i) => i.href)).toEqual(['/models']);
  });

  it('is idempotent once the list is already collapsed', () => {
    const once = collapseSettingsNav([settingsGroup()]);
    const twice = collapseSettingsNav(once);
    expect(twice[0]!.items.map((i) => i.href)).toEqual(once[0]!.items.map((i) => i.href));
  });
});

describe('expandSettingsNavForFilter', () => {
  it('keeps every hub screen findable AND adds the Settings row', () => {
    const g = expandSettingsNavForFilter([settingsGroup()])[0]!;
    expect(g.items.map((i) => i.href)).toEqual([
      SETTINGS_HUB_HREF,
      '/settings/accounts',
      '/settings/backups',
      '/settings/appearance',
    ]);
  });

  it('keeps the hidden Discover row findable, still without a Settings row', () => {
    const g = expandSettingsNavForFilter([reviewGroup()])[0]!;
    expect(g.items.map((i) => i.href)).toEqual(['/models', '/settings/discover']);
  });

  it('does not add a second Settings row once one exists', () => {
    const collapsed = collapseSettingsNav([settingsGroup()]);
    const g = expandSettingsNavForFilter(collapsed)[0]!;
    expect(g.items.filter((i) => i.href === SETTINGS_HUB_HREF)).toHaveLength(1);
  });
});
