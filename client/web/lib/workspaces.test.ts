/**
 * The pure rules of the workspaces screens (W5a): areas, who may change
 * what, the words, the lists and the switcher's choice.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  ALL_WORKSPACES,
  ALL_WORKSPACES_LABEL,
  addableHits,
  addableResources,
  archiveConfirmText,
  areaForPath,
  canArchiveWorkspace,
  archiveBlocked,
  addedText,
  canChangeUser,
  nextUserSearchOffset,
  canManageWorkspace,
  canPickAssistant,
  canSetConnectors,
  canSetContact,
  removeUserText,
  BUILT_IN_NAME_HINT,
  canRemoveUser,
  isBuiltIn,
  isTeamWorkspace,
  showsTeamSettings,
  userSearchPaged,
  userSearchMin,
  currentWorkspaceLabel,
  hasArea,
  isAdminUserShell,
  shellRoleOf,
  mayOpenPath,
  navWithAreas,
  PATH_AREAS,
  resolveCurrentWorkspace,
  shellAreasOf,
  shellWorkspacesOf,
  sortWorkspaces,
  userLabel,
  userSearchReady,
  workspaceErrorCode,
  workspaceErrorText,
  workspaceMeta,
  workspacesOfLogin,
  type Workspace,
  type WorkspaceDetail,
} from './workspaces';

function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    name: 'Team',
    description: '',
    contactNodeId: null,
    assistant: null,
    isAdmin: false,
    adminModerated: false,
    archived: false,
    userCount: 2,
    resourceCount: 1,
    me: { member: true, moderator: false },
    // Admin and Team are the built-in two (the brain always sends it).
    builtIn: over.isAdmin === true || over.adminModerated === true,
    ...over,
  };
}

describe('areas', () => {
  it('a brain that names no areas leaves every area on (it serves only admins)', () => {
    expect(hasArea(undefined, 'keys')).toBe(true);
    expect(hasArea(null, 'users')).toBe(true);
  });

  it('a named list is the only truth', () => {
    expect(hasArea(['settings'], 'settings')).toBe(true);
    expect(hasArea(['settings'], 'keys')).toBe(false);
    expect(hasArea([], 'settings')).toBe(false);
  });

  it('maps settings paths to their area, and the Workspaces list to none', () => {
    expect(areaForPath('/settings/users')).toBe('users');
    expect(areaForPath('/settings/agents')).toBe('assistants');
    expect(areaForPath('/settings/connectors')).toBe('connectors');
    expect(areaForPath('/settings/keys')).toBe('keys');
    expect(areaForPath('/settings/appearance')).toBe('settings');
    expect(areaForPath('/settings')).toBe('settings');
    expect(areaForPath('/settings/workspaces')).toBeNull();
    expect(areaForPath('/pages')).toBeNull();
    // A prefix is a whole segment: /settings/usersx is not Users.
    expect(areaForPath('/settings/usersx')).toBe('settings');
  });

  // Phase W5c: one table for every screen (PATH_AREAS).
  it.each([
    '/journal',
    '/inbox',
    '/recall',
    '/formulas',
    '/events',
    '/contacts',
    '/secrets',
    '/docs',
    '/models',
    '/pending',
    '/assistant',
    '/nodes',
    '/heartbeats',
    '/studio',
    '/dev-tools',
    '/runners',
    '/runs',
    '/sandboxes',
    '/traces',
    '/debug',
    '/changelog',
    '/tasks',
  ])('%s and what is under it need the settings area', (p) => {
    expect(areaForPath(p)).toBe('settings');
    expect(areaForPath(`${p}/x/y`)).toBe('settings');
    expect(areaForPath(`${p}?q=1`)).toBe('settings');
    expect(mayOpenPath([], p)).toBe(false);
    expect(mayOpenPath(['users'], p)).toBe(false);
    expect(mayOpenPath(['settings'], p)).toBe(true);
    // A path no row names needs the settings area too.
    expect(areaForPath(`${p}x`)).toBe('settings');
  });

  it.each([
    '/',
    '/files',
    '/notes',
    '/pages',
    '/draw',
    '/tables',
    '/apps',
    '/n',
    '/settings/workspaces',
    '/settings/mcp',
    '/settings/api-access',
  ])('%s and what is under it are open to every login', (p) => {
    expect(areaForPath(p)).toBeNull();
    expect(mayOpenPath([], p)).toBe(true);
    if (p !== '/') {
      expect(areaForPath(`${p}/abc`)).toBeNull();
      expect(mayOpenPath([], `${p}/abc`)).toBe(true);
    }
  });

  it('the table names each prefix once, the narrow settings rows above /settings', () => {
    const prefixes = PATH_AREAS.map(([p]) => p);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    const settingsAt = prefixes.indexOf('/settings');
    prefixes.forEach((p, i) => {
      if (p.startsWith('/settings/')) expect(i, p).toBeLessThan(settingsAt);
    });
  });

  it('a path no row names needs the settings area; / matches the home only', () => {
    expect(areaForPath('/somewhere-new')).toBe('settings');
    expect(areaForPath('/nx')).toBe('settings');
    expect(areaForPath('/pagesx')).toBe('settings');
    expect(areaForPath('')).toBeNull();
  });

  it('opens a path only with its area', () => {
    expect(mayOpenPath(['settings'], '/settings/keys')).toBe(false);
    expect(mayOpenPath(['keys'], '/settings/keys')).toBe(true);
    expect(mayOpenPath([], '/settings/workspaces')).toBe(true);
    expect(mayOpenPath([], '/pages')).toBe(true);
    expect(mayOpenPath(undefined, '/settings/keys')).toBe(true);
  });

  it('drops nav rows (and empty groups, and cold-start heads) the login may not open', () => {
    const groups = [
      {
        label: 'Settings',
        items: [{ href: '/settings/keys' }, { href: '/settings/workspaces' }],
        defaultHead: ['/settings/keys', '/settings/workspaces'],
      },
      { label: 'Keys', items: [{ href: '/settings/keys' }] },
      { label: 'Work', items: [{ href: '/pages' }] },
    ];
    const out = navWithAreas(groups, ['settings']);
    expect(out.map((g) => g.label)).toEqual(['Settings', 'Work']);
    expect(out[0]!.items.map((i) => i.href)).toEqual(['/settings/workspaces']);
    expect(out[0]!.defaultHead).toEqual(['/settings/workspaces']);
    expect(navWithAreas(groups, undefined)).toEqual(groups);
  });
});

describe('shellRoleOf and isAdminUserShell', () => {
  it('reads the role the brain names', () => {
    expect(shellRoleOf({ role: 'admin' })).toBe('admin');
    expect(shellRoleOf({ role: 'member' })).toBe('member');
    expect(shellRoleOf({ role: 'client' })).toBe('client');
  });
  it('a brain that names no role answered an admin only', () => {
    expect(shellRoleOf({})).toBe('admin');
    expect(shellRoleOf({ role: null })).toBe('admin');
  });
  it('a role this build does not know fails closed, as a client', () => {
    expect(shellRoleOf({ role: 'guest' })).toBe('client');
    expect(shellRoleOf({ role: 7 })).toBe('client');
  });
  it('no shell yet: no role', () => {
    expect(shellRoleOf(undefined)).toBeNull();
    expect(shellRoleOf(null)).toBeNull();
  });
  it('an Admin user is the admin role, and only that', () => {
    expect(isAdminUserShell({ role: 'admin' })).toBe(true);
    expect(isAdminUserShell({})).toBe(true);
    expect(isAdminUserShell({ role: 'member' })).toBe(false);
    expect(isAdminUserShell({ role: 'client' })).toBe(false);
    expect(isAdminUserShell(undefined)).toBe(false);
  });
});

describe('who may change what', () => {
  it('a Moderator manages their workspace without any area', () => {
    expect(canManageWorkspace(ws({ me: { member: true, moderator: true } }), [])).toBe(true);
  });

  it('a plain user does not', () => {
    expect(canManageWorkspace(ws(), ['settings'])).toBe(false);
  });

  it('the Users and workspaces area manages any workspace', () => {
    expect(canManageWorkspace(ws({ me: { member: false, moderator: false } }), ['users'])).toBe(
      true,
    );
  });

  it('nobody changes an archived workspace here', () => {
    expect(
      canManageWorkspace(ws({ archived: true, me: { member: true, moderator: true } }), ['users']),
    ).toBe(false);
  });

  it('Admin is never offered Archive', () => {
    const mod = { member: true, moderator: true };
    expect(canArchiveWorkspace(ws({ me: mod }), [])).toBe(true);
    expect(canArchiveWorkspace(ws({ isAdmin: true, me: mod }), ['users'])).toBe(false);
  });

  it('built in: the brain says so, else Admin or an Admin-moderated workspace', () => {
    expect(isBuiltIn({ builtIn: true, isAdmin: false, adminModerated: false })).toBe(true);
    expect(isBuiltIn({ builtIn: false, isAdmin: false, adminModerated: true })).toBe(false);
    expect(isBuiltIn({ isAdmin: true, adminModerated: false })).toBe(true);
    expect(isBuiltIn({ isAdmin: false, adminModerated: true })).toBe(true);
    expect(isBuiltIn({ isAdmin: false, adminModerated: false })).toBe(false);
    expect(BUILT_IN_NAME_HINT).toBe('Built-in workspaces keep their names.');
  });

  it('Team is the built-in workspace that is not Admin', () => {
    expect(isTeamWorkspace({ builtIn: true, isAdmin: false, adminModerated: true })).toBe(true);
    expect(isTeamWorkspace({ isAdmin: false, adminModerated: true })).toBe(true);
    expect(isTeamWorkspace({ builtIn: true, isAdmin: true, adminModerated: false })).toBe(false);
    expect(isTeamWorkspace({ builtIn: false, isAdmin: false, adminModerated: false })).toBe(false);
  });

  it('the Team settings show on the live Team workspace to the settings area only', () => {
    const team = { builtIn: true, isAdmin: false, adminModerated: true, archived: false };
    expect(showsTeamSettings(team, ['settings'])).toBe(true);
    // A brain that sends no areas answered the shell for an admin.
    expect(showsTeamSettings(team, undefined)).toBe(true);
    expect(showsTeamSettings(team, ['users'])).toBe(false);
    expect(showsTeamSettings(team, [])).toBe(false);
    expect(showsTeamSettings({ ...team, archived: true }, ['settings'])).toBe(false);
    expect(showsTeamSettings({ ...team, isAdmin: true }, ['settings'])).toBe(false);
    expect(
      showsTeamSettings({ ...team, builtIn: false, adminModerated: false }, ['settings']),
    ).toBe(false);
  });

  it('Team is never offered Archive, even to its Moderator with the users area', () => {
    const mod = { member: true, moderator: true };
    expect(canArchiveWorkspace(ws({ adminModerated: true, me: mod }), ['users'])).toBe(false);
    expect(canArchiveWorkspace(ws({ builtIn: true, me: mod }), ['users'])).toBe(false);
  });

  it('no Remove on your own row in Admin', () => {
    expect(canRemoveUser({ isAdmin: true }, { email: 'Me@x.test' }, 'me@X.test')).toBe(false);
    expect(canRemoveUser({ isAdmin: true }, { email: 'b@x.test' }, 'me@x.test')).toBe(true);
    expect(canRemoveUser({ isAdmin: false }, { email: 'me@x.test' }, 'me@x.test')).toBe(true);
    expect(canRemoveUser({ isAdmin: true }, { email: 'me@x.test' }, null)).toBe(true);
  });

  it('the contact is set by an Admin user; the assistant needs the Assistants area', () => {
    expect(canSetContact(['users'])).toBe(true);
    expect(canSetContact(['settings'])).toBe(false);
    expect(canSetContact([])).toBe(false);
    expect(canPickAssistant(['assistants'])).toBe(true);
    expect(canPickAssistant(['settings'])).toBe(false);
  });

  it('an Admin user kept in Team is demoted or removed by nobody', () => {
    expect(canChangeUser({ adminViaArea: true })).toBe(false);
    expect(canChangeUser({ adminViaArea: false })).toBe(true);
  });

  it('says who added a user, and when', () => {
    const at = '2026-10-10T09:00:00.000Z';
    expect(addedText({ addedBy: { loginId: 'l1', name: 'Ann Lee' }, addedAt: at })).toMatch(
      /^Added by Ann Lee on \S/,
    );
    expect(addedText({ addedBy: null, addedAt: at })).toMatch(/^Added on \S/);
    expect(addedText({ addedBy: null })).toBeNull();
    expect(addedText({ addedAt: 'nonsense' })).toBeNull();
  });

  it('connectors are set with the Connectors area', () => {
    expect(canSetConnectors(['connectors'])).toBe(true);
    expect(canSetConnectors([])).toBe(false);
  });

  it('removing from Admin is said as the role change it is', () => {
    expect(removeUserText({ name: 'Admin', isAdmin: true }, 'Bo')).toContain(
      'Bo stops being an Admin user',
    );
    expect(removeUserText({ name: 'Admin', isAdmin: true }, 'Bo')).toContain('sessions end');
    expect(removeUserText({ name: 'Team', isAdmin: false }, 'Bo')).toBe(
      'Bo stops reading the items shared with Team, unless another of their workspaces has them.',
    );
  });
});

describe('words', () => {
  it('counts users and names the assistant', () => {
    expect(workspaceMeta({ userCount: 1, assistant: null })).toBe('1 user');
    expect(workspaceMeta({ userCount: 3, assistant: { id: 'a', name: 'Nova' } })).toBe(
      '3 users · Nova',
    );
  });

  it('the archive confirm lists the shares that go', () => {
    const text = archiveConfirmText('Sales', { grantCount: 12, itemCount: 0 });
    expect(text).toContain('12 items shared with Sales lose that share');
    expect(archiveConfirmText('Sales', { grantCount: 1, itemCount: 0 })).toContain(
      '1 item shared with Sales loses that share',
    );
    expect(archiveConfirmText('Sales', { grantCount: 0, itemCount: 0 })).toContain(
      'No items are shared with Sales',
    );
    expect(archiveBlocked({ grantCount: 5, itemCount: 0 })).toBe(false);
  });

  it('archive waits while items have their home here', () => {
    expect(archiveBlocked({ grantCount: 0, itemCount: 2 })).toBe(true);
    expect(archiveConfirmText('Sales', { grantCount: 0, itemCount: 2 })).toBe(
      '2 items have their home in Sales. Move them to another workspace first.',
    );
    expect(archiveConfirmText('Sales', { grantCount: 0, itemCount: 1 })).toBe(
      '1 item has its home in Sales. Move it to another workspace first.',
    );
  });

  it('no em dashes in the words', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
    for (const p of [
      { grantCount: 2, itemCount: 0 },
      { grantCount: 0, itemCount: 2 },
      { grantCount: 0, itemCount: 0 },
    ]) {
      expect(archiveConfirmText('X', p)).not.toMatch(dash);
    }
  });

  it('shows the brain error text plainly, with its code', () => {
    const err = new ApiError('This assistant has history in Team.', 409, {
      error: 'This assistant has history in Team.',
      code: 'assistant_has_history',
    });
    expect(workspaceErrorText(err)).toBe('This assistant has history in Team.');
    expect(workspaceErrorCode(err)).toBe('assistant_has_history');
    expect(workspaceErrorText(new Error('x'), 'Fallback.')).toBe('Fallback.');
    expect(workspaceErrorCode(new Error('x'))).toBeNull();
  });

  it('names a user by display name, else email', () => {
    expect(userLabel({ name: 'Ann Lee', email: 'a@x.test' })).toBe('Ann Lee');
    expect(userLabel({ name: '  ', email: 'a@x.test' })).toBe('a@x.test');
    expect(userLabel({ name: null, email: 'a@x.test' })).toBe('a@x.test');
  });
});

describe('lists', () => {
  it('sorts Admin first, then by name, archived last', () => {
    const out = sortWorkspaces([
      ws({ id: 'z', name: 'Zed', archived: true }),
      ws({ id: 'b', name: 'Beta' }),
      ws({ id: 'a', name: 'Admin', isAdmin: true }),
      ws({ id: 'c', name: 'Alpha' }),
    ]);
    expect(out.map((w) => w.id)).toEqual(['a', 'c', 'b', 'z']);
  });

  it('user search starts at three characters for a Moderator, at none for an Admin user', () => {
    expect(userSearchMin([])).toBe(3);
    expect(userSearchMin(['users'])).toBe(0);
    expect(userSearchMin(['settings'])).toBe(3);
    expect(userSearchPaged(['users'])).toBe(true);
    expect(userSearchPaged(['settings', 'keys'])).toBe(false);
    expect(userSearchReady(' ab ')).toBe(false);
    expect(userSearchReady(' abc ')).toBe(true);
    expect(userSearchReady('', 0)).toBe(true);
  });

  it('an Admin user pages the user search by 50; a Moderator never pages', () => {
    const full = Array.from({ length: 50 }, () => ({}));
    expect(nextUserSearchOffset([full], true)).toBe(50);
    expect(nextUserSearchOffset([full, full], true)).toBe(100);
    expect(nextUserSearchOffset([full, [{}]], true)).toBeUndefined();
    expect(nextUserSearchOffset([full], false)).toBeUndefined();
    expect(nextUserSearchOffset([], true)).toBeUndefined();
  });

  it('offers only users not in the workspace yet', () => {
    const hits = [
      { loginId: 'l1', name: 'A', email: 'a@x.test' },
      { loginId: 'l2', name: 'B', email: 'b@x.test' },
    ];
    expect(addableHits(hits, [{ loginId: 'l1' }]).map((h) => h.loginId)).toEqual(['l2']);
  });

  it('offers only connectors not on the workspace yet', () => {
    const all = [{ slug: 'drive' }, { slug: 'crm' }];
    const held = [{ kind: 'connector' as const, id: 'drive', name: 'Drive', write: false }];
    expect(addableResources(all, held, 'connector').map((c) => c.slug)).toEqual(['crm']);
  });

  it('finds the workspaces a login is in, Admin first, archived left out', () => {
    const detail = (w: Workspace, loginIds: string[]): WorkspaceDetail => ({
      workspace: w,
      users: loginIds.map((loginId) => ({
        loginId,
        name: null,
        email: `${loginId}@x.test`,
        moderator: false,
        adminViaArea: false,
        addedBy: null,
        addedAt: '2026-10-10T09:00:00.000Z',
      })),
      resources: [],
      hasHistory: false,
    });
    const out = workspacesOfLogin(
      [
        detail(ws({ id: 't', name: 'Team' }), ['l1']),
        detail(ws({ id: 'a', name: 'Admin', isAdmin: true }), ['l1']),
        detail(ws({ id: 'o', name: 'Old', archived: true }), ['l1']),
        detail(ws({ id: 's', name: 'Sales' }), ['l2']),
        undefined,
      ],
      'l1',
    );
    expect(out).toEqual([
      { id: 'a', name: 'Admin' },
      { id: 't', name: 'Team' },
    ]);
  });
});

describe('the switcher choice', () => {
  const list = [
    { id: 'a', name: 'Admin' },
    { id: 't', name: 'Team' },
  ];

  it('keeps a stored workspace the login is still in', () => {
    expect(resolveCurrentWorkspace('t', list)).toBe('t');
    expect(currentWorkspaceLabel('t', list)).toBe('Team');
  });

  it('falls back to All for none, or a workspace the login left', () => {
    expect(resolveCurrentWorkspace(null, list)).toBe(ALL_WORKSPACES);
    expect(resolveCurrentWorkspace('gone', list)).toBe(ALL_WORKSPACES);
    expect(currentWorkspaceLabel(ALL_WORKSPACES, list)).toBe(ALL_WORKSPACES_LABEL);
  });
});

describe('the shell payload', () => {
  it('reads workspaces and areas, ignoring what it does not know', () => {
    expect(
      shellWorkspacesOf({
        workspaces: [{ id: 'a', name: 'Admin', isAdmin: true, moderator: true }, { id: 3 }, null],
      }),
    ).toEqual([{ id: 'a', name: 'Admin', isAdmin: true, moderator: true }]);
    expect(shellWorkspacesOf({})).toEqual([]);
    expect(shellAreasOf({ areas: ['users', 4] })).toEqual(['users']);
    expect(shellAreasOf({})).toBeUndefined();
  });
});
