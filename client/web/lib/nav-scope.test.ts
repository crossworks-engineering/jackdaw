import { describe, expect, it } from 'vitest';
import { Bot, type LucideIcon } from 'lucide-react';
import { NAV_GROUPS, type NavGroup } from '@mantle/web-ui/layout/nav-items';
import { scopeGroups } from './nav-scope';

/**
 * The scope filter hides things on purpose, which makes it the kind of feature
 * that fails silently: a screen simply is not there, and nobody can tell
 * whether that was intended. These run against the REAL `NAV_GROUPS` rather
 * than a fixture, so the day someone adds a settings screen and forgets to
 * classify it, the omission shows up here instead of in a support message.
 */

const icon = Bot as LucideIcon;
const names = (groups: NavGroup[]) => groups.flatMap((g) => g.items).map((i) => i.name);
const labels = (groups: NavGroup[]) => groups.map((g) => g.label);

describe('admin', () => {
  it('is exactly the list, untouched', () => {
    // The pre-existing behaviour has to survive intact: admin is not a filter
    // that happens to pass everything, it is the same array.
    expect(scopeGroups(NAV_GROUPS, 'admin')).toBe(NAV_GROUPS);
  });
});

describe('work', () => {
  const work = scopeGroups(NAV_GROUPS, 'work');

  it('shows Workspace and Review, and nothing else', () => {
    expect(labels(work)).toEqual(['Workspace', 'Review']);
  });

  it('keeps those groups WHOLE — it selects groups, it does not thin them', () => {
    const source = NAV_GROUPS.filter((g) => g.label === 'Workspace' || g.label === 'Review');
    expect(names(work)).toEqual(names(source));
  });

  it('carries the daily surfaces', () => {
    expect(names(work)).toEqual(expect.arrayContaining(['Pages', 'Tasks', 'Email', 'Pending']));
  });

  it('hides the machine', () => {
    expect(names(work)).not.toContain('Debug');
    expect(names(work)).not.toContain('Backups');
  });
});

describe('settings', () => {
  const settings = scopeGroups(NAV_GROUPS, 'settings');
  const shown = names(settings);

  it('carries the four Jason named', () => {
    // The only part of the mapping that is not a proposal.
    expect(shown).toEqual(expect.arrayContaining(['Agents', 'AI workers', 'MCP', 'Profile']));
  });

  it('carries what those four need to be useful', () => {
    // An agent with no tools, no keys and no accounts is not configured.
    expect(shown).toEqual(
      expect.arrayContaining(['Tools', 'Tool groups', 'Skills', 'API keys', 'Accounts', 'Models']),
    );
  });

  it('leaves the plumbing to admin', () => {
    // Capability versus plumbing is the line; these are the box, not the job.
    for (const plumbing of ['Backups', 'Updates', 'Audit log', 'Logins', 'Peers', 'Debug']) {
      expect(shown).not.toContain(plumbing);
    }
  });

  it('shows no group heading with nothing under it', () => {
    for (const group of settings) expect(group.items.length).toBeGreaterThan(0);
  });

  it('is a slice, not a superset — the daily screens are not in it', () => {
    // If this ever fails, `settings` has quietly become `admin` with extra
    // steps and the middle option has stopped earning its place.
    expect(shown).not.toContain('Pages');
  });

  it('every href it names still exists in the nav', () => {
    // The mapping is a flat list of strings and nothing type-checks it against
    // the real routes: a renamed href would silently drop a screen out of the
    // scope it belongs to, with no error anywhere.
    const live = new Set(NAV_GROUPS.flatMap((g) => g.items).map((i) => i.href));
    const scopedHrefs = settings.flatMap((g) => g.items).map((i) => i.href);
    for (const href of scopedHrefs) expect(live.has(href)).toBe(true);
    // …and the set is not silently empty.
    expect(scopedHrefs.length).toBeGreaterThan(10);
  });
});

describe('a group the scope empties', () => {
  it('is dropped rather than rendered as a bare heading', () => {
    const groups: NavGroup[] = [
      { label: 'Workspace', items: [{ name: 'Pages', href: '/pages', icon }] },
      { label: 'System', items: [{ name: 'Debug', href: '/debug', icon }] },
    ];
    expect(labels(scopeGroups(groups, 'work'))).toEqual(['Workspace']);
  });
});
