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
  isAdminUser,
  resourceEditable,
  userSearchMin,
  currentWorkspaceLabel,
  hasArea,
  mayOpenPath,
  navWithAreas,
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
      { label: 'Keys', items: [{ href: '/settings/api-access' }] },
      { label: 'Work', items: [{ href: '/pages' }] },
    ];
    const out = navWithAreas(groups, ['settings']);
    expect(out.map((g) => g.label)).toEqual(['Settings', 'Work']);
    expect(out[0]!.items.map((i) => i.href)).toEqual(['/settings/workspaces']);
    expect(out[0]!.defaultHead).toEqual(['/settings/workspaces']);
    expect(navWithAreas(groups, undefined)).toEqual(groups);
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

  it('an Admin user is one the brain names areas for', () => {
    expect(isAdminUser(['settings'])).toBe(true);
    expect(isAdminUser([])).toBe(false);
    expect(isAdminUser(undefined)).toBe(true);
  });

  it('the contact is set by an Admin user; the assistant needs the Assistants area', () => {
    expect(canSetContact(['settings'])).toBe(true);
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

  it('a connector row the level bridge keeps has no controls', () => {
    expect(resourceEditable({ locked: true })).toBe(false);
    expect(resourceEditable({ locked: false })).toBe(true);
    expect(resourceEditable({})).toBe(true);
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
    const held = [{ kind: 'connector', id: 'drive', name: 'Drive', write: false }];
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
