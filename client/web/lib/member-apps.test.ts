import { describe, expect, it } from 'vitest';
import {
  appCountLabel,
  launcherApps,
  launcherLevel,
  memberAppHref,
  memberAppProblem,
  memberAppsHref,
  memberHubNav,
  type AppLauncherFolder,
  type MemberAppListWire,
} from './member-apps';

const PAGE = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-222222222222';
const hub = {
  sections: [
    {
      token: PAGE,
      title: 'Plan',
      icon: null,
      summary: null,
      updatedAt: '2026-09-27T00:00:00Z',
      parentToken: null,
    },
  ],
  apps: [{ token: APP, title: 'Polls', description: null, updatedAt: '2026-09-27T00:00:00Z' }],
};

describe('memberHubNav', () => {
  it('opens the chat dock', () => {
    expect(memberHubNav(hub, 'chat')).toEqual({ kind: 'chat' });
  });

  it('opens a listed section in the Library and a listed app in the run view', () => {
    expect(memberHubNav(hub, { briefing: PAGE })).toEqual({
      kind: 'href',
      href: `/pages?id=${PAGE}&src=library`,
    });
    expect(memberHubNav(hub, { app: APP })).toEqual({ kind: 'href', href: memberAppHref(APP) });
  });

  it('goes nowhere for a token the payload did not list', () => {
    expect(memberHubNav(hub, { briefing: APP })).toBeNull();
    expect(memberHubNav(hub, { app: PAGE })).toBeNull();
    expect(memberHubNav(hub, { briefing: '/settings' })).toBeNull();
  });
});

describe('memberHubNav edge cases', () => {
  it('goes nowhere for the home app itself (it is not in hub.apps)', () => {
    const HOME = '33333333-3333-4333-8333-333333333333';
    expect(memberHubNav(hub, { app: HOME })).toBeNull();
  });

  it('copes with a payload without apps', () => {
    expect(
      memberHubNav({ sections: hub.sections, apps: undefined as never }, { app: APP }),
    ).toBeNull();
  });

  it('prefers the app when a target names both (as isHubNavTarget allows)', () => {
    expect(memberHubNav(hub, { app: APP, briefing: PAGE } as never)).toEqual({
      kind: 'href',
      href: memberAppHref(APP),
    });
  });

  it('encodes the section token in the Library link', () => {
    const odd = { ...hub.sections[0]!, token: 'a&b=c' };
    expect(memberHubNav({ sections: [odd], apps: [] }, { briefing: 'a&b=c' })).toEqual({
      kind: 'href',
      href: '/pages?id=a%26b%3Dc&src=library',
    });
  });
});

describe('launcherApps', () => {
  it('leaves the home app out of the launcher', () => {
    const card = (id: string) => ({
      id,
      title: id,
      icon: null,
      color: null,
      description: null,
      audience: 'team' as const,
      updatedAt: 'u',
    });
    expect(launcherApps({ apps: [card('a'), card('b')], homeAppId: 'a' }).map((a) => a.id)).toEqual(
      ['b'],
    );
    expect(launcherApps({ apps: [card('a')], homeAppId: null })).toHaveLength(1);
  });
});

describe('launcherLevel', () => {
  const card = (id: string) => ({
    id,
    title: id,
    icon: null,
    color: null,
    description: null,
    audience: 'team' as const,
    updatedAt: 'u',
  });
  const folder = (
    id: string,
    parentId: string | null,
    appIds: string[],
    look: Partial<AppLauncherFolder> = {},
  ): AppLauncherFolder => ({
    id,
    name: `Folder ${id}`,
    icon: null,
    color: null,
    parentId,
    appIds,
    ...look,
  });
  const list = (
    apps: string[],
    folders?: AppLauncherFolder[] | null,
    homeAppId: string | null = null,
  ): MemberAppListWire => ({ apps: apps.map(card), homeAppId, folders });
  const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

  it('an older brain (no folders) is today’s flat grid, the home app left out', () => {
    for (const folders of [undefined, null]) {
      const top = launcherLevel(list(['a', 'b', 'home'], folders, 'home'), null)!;
      expect(top.folder).toBeNull();
      expect(top.crumbs).toEqual([]);
      expect(top.folders).toEqual([]);
      expect(ids(top.apps)).toEqual(['a', 'b']);
    }
    // And a folder link from a newer visit is no folder there.
    expect(launcherLevel(list(['a']), 'f1')).toBeNull();
  });

  it('shows folders next to the apps no folder names, at the top level', () => {
    const top = launcherLevel(
      list(['a', 'b', 'c'], [folder('f1', null, ['b'], { icon: 'lucide:rocket', color: 'teal' })]),
      null,
    )!;
    expect(top.folders).toEqual([
      { id: 'f1', name: 'Folder f1', icon: 'lucide:rocket', color: 'teal', appCount: 1 },
    ]);
    expect(ids(top.apps)).toEqual(['a', 'c']);
  });

  it('opens a folder to its apps and subfolders, with the way back', () => {
    const wire = list(
      ['a', 'b', 'c', 'd'],
      [
        folder('top', null, ['a']),
        folder('mid', 'top', []),
        folder('leaf', 'mid', ['b', 'c']),
        folder('other', null, ['d']),
      ],
    );
    const top = launcherLevel(wire, null)!;
    expect(top.folders.map((f) => [f.id, f.appCount])).toEqual([
      ['top', 3],
      ['other', 1],
    ]);
    expect(top.apps).toEqual([]);

    const open = launcherLevel(wire, 'top')!;
    expect(open.folder).toMatchObject({ id: 'top', appCount: 3 });
    expect(open.crumbs).toEqual([]);
    expect(ids(open.folders)).toEqual(['mid']);
    expect(ids(open.apps)).toEqual(['a']);

    const leaf = launcherLevel(wire, 'leaf')!;
    expect(ids(leaf.crumbs)).toEqual(['top', 'mid']);
    expect(leaf.folders).toEqual([]);
    expect(ids(leaf.apps)).toEqual(['b', 'c']);
  });

  it('keeps the brain’s folder order and the list’s app order', () => {
    const wire = list(['a', 'b', 'c'], [folder('z', null, ['c', 'a']), folder('y', null, ['b'])]);
    expect(ids(launcherLevel(wire, null)!.folders)).toEqual(['z', 'y']);
    expect(ids(launcherLevel(wire, 'z')!.apps)).toEqual(['c', 'a']);
  });

  it('drops a folder that leads only to the home app, at every depth', () => {
    const wire = list(
      ['home', 'a'],
      [
        folder('onlyHome', null, []),
        folder('inner', 'onlyHome', ['home']),
        folder('f', null, ['a']),
      ],
      'home',
    );
    expect(ids(launcherLevel(wire, null)!.folders)).toEqual(['f']);
    expect(launcherLevel(wire, 'onlyHome')).toBeNull();
    expect(launcherLevel(wire, 'inner')).toBeNull();
  });

  it('never loses an app to a bad shape: unknown parent, a loop, an app named twice', () => {
    const wire = list(
      ['a', 'b', 'c', 'd'],
      [
        folder('orphan', 'gone', ['a']),
        folder('x', 'y', ['b']),
        folder('y', 'x', ['c']),
        folder('twice', null, ['a', 'ghost']),
      ],
    );
    const top = launcherLevel(wire, null)!;
    // Each of them sits at the top level; `a` shows once, in the first
    // folder that names it; an id the list does not hold is ignored.
    expect(top.folders.map((f) => [f.id, f.appCount])).toEqual([
      ['orphan', 1],
      ['x', 1],
      ['y', 1],
    ]);
    expect(ids(top.apps)).toEqual(['d']);
    expect(ids(launcherLevel(wire, 'x')!.apps)).toEqual(['b']);
    expect(launcherLevel(wire, 'twice')).toBeNull();
  });

  it('ignores a folder that is not one, and anything that is not a list', () => {
    const junk = [null, 'x', { id: 'f', name: 'F' }, { id: 1, name: 'F', appIds: [] }];
    const top = launcherLevel(list(['a'], junk as never), null)!;
    expect(top.folders).toEqual([]);
    expect(ids(top.apps)).toEqual(['a']);
    expect(ids(launcherLevel(list(['a'], 'nope' as never), null)!.apps)).toEqual(['a']);
  });

  it('links a folder by id, and the top level plainly', () => {
    expect(memberAppsHref(null)).toBe('/apps');
    expect(memberAppsHref('a&b')).toBe('/apps?folder=a%26b');
  });

  it('counts in words', () => {
    expect(appCountLabel(1)).toBe('1 app');
    expect(appCountLabel(4)).toBe('4 apps');
  });
});

describe('memberAppProblem', () => {
  it('sends an expired session to sign in', () => {
    expect(memberAppProblem('app frame ticket failed (401)')).toEqual({ signIn: true });
  });

  it('words a refused tool for a member, not a builder', () => {
    const p = memberAppProblem(
      "This app tried to use the tool “x”, which it hasn't declared. Add it to the app's tools (app_tools_set)",
    );
    expect(p).toEqual({ text: expect.stringContaining('Tell an admin') });
    expect(JSON.stringify(p)).not.toContain('app_tools_set');
  });

  it('never passes raw sandbox text to a member', () => {
    expect(memberAppProblem('the app never signalled ready')).toEqual({
      text: expect.stringContaining('This app hit a problem'),
    });
  });
});
