import { describe, expect, it } from 'vitest';
import {
  launcherApps,
  memberAppHref,
  memberAppProblem,
  memberAppsHref,
  memberHubNav,
  memberLauncherLevel,
  type MemberAppListWire,
} from './member-apps';
import type { AppLauncherFolder } from './app-launcher';

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

describe('memberLauncherLevel', () => {
  // The grouping itself is pinned in app-launcher.test.ts; here, what is the
  // member's own: the home app left out, and where a folder opens.
  const card = (id: string) => ({
    id,
    title: id,
    icon: null,
    color: null,
    description: null,
    audience: 'team' as const,
    updatedAt: 'u',
  });
  const folder = (id: string, parentId: string | null, appIds: string[]): AppLauncherFolder => ({
    id,
    name: `Folder ${id}`,
    icon: null,
    color: null,
    parentId,
    appIds,
  });
  const list = (
    apps: string[],
    folders?: AppLauncherFolder[] | null,
    homeAppId: string | null = null,
  ): MemberAppListWire => ({ apps: apps.map(card), homeAppId, folders });
  const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

  it('an older brain (no folders) is today’s flat grid, the home app left out', () => {
    for (const folders of [undefined, null]) {
      const top = memberLauncherLevel(list(['a', 'b', 'home'], folders, 'home'), null)!;
      expect(top.folders).toEqual([]);
      expect(ids(top.apps)).toEqual(['a', 'b']);
    }
    expect(memberLauncherLevel(list(['a']), 'f1')).toBeNull();
  });

  it('shows folders next to the top level apps', () => {
    const top = memberLauncherLevel(list(['a', 'b'], [folder('f1', null, ['b'])]), null)!;
    expect(top.folders.map((f) => [f.id, f.appCount])).toEqual([['f1', 1]]);
    expect(ids(top.apps)).toEqual(['a']);
  });

  it('drops a folder that leads only to the home app, at every depth', () => {
    const wire = list(
      ['home', 'a'],
      [
        folder('onlyHome', null, []),
        folder('inner', 'onlyHome', ['home']),
        folder('f', null, ['a', 'home']),
      ],
      'home',
    );
    expect(ids(memberLauncherLevel(wire, null)!.folders)).toEqual(['f']);
    expect(memberLauncherLevel(wire, null)!.folders[0]!.appCount).toBe(1);
    expect(memberLauncherLevel(wire, 'onlyHome')).toBeNull();
    expect(memberLauncherLevel(wire, 'inner')).toBeNull();
    expect(ids(memberLauncherLevel(wire, 'f')!.apps)).toEqual(['a']);
  });

  it('links a folder by id, and the top level plainly', () => {
    expect(memberAppsHref(null)).toBe('/apps');
    expect(memberAppsHref('a&b')).toBe('/apps?folder=a%26b');
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
