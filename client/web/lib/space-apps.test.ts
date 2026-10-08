import { describe, expect, it } from 'vitest';
import {
  activityLabel,
  activityRefused,
  activityWho,
  activityWrite,
  adminMemberAppStatus,
  deletedAppRestorePath,
  MEMBER_APP_DELETED_TOAST,
  MEMBER_APP_DELETE_CONFIRM,
  memberAppAdminPath,
  acceptSummary,
  appAuthorLevel,
  APP_TRUST_CONFIRM,
  showsTrustSwitch,
  APP_ACCEPT_LEVEL_MEANING,
  APP_TRUST_OFF_HINT,
  MY_APP_SHARE_HINT,
  MY_APP_SUBMIT_HINT,
  APP_TRUST_TOOLS_HINT,
  MY_APPS_HOWTO,
  myAppActionPath,
  runnableSpaceApp,
  spaceAppActions,
  spaceAppStatus,
  spaceAppSubmitHint,
  submissionFiles,
  type SpaceAppCard,
} from './space-apps';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const APP: SpaceAppCard = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Stock counter',
  description: null,
  mine: true,
  authorName: null,
  sharing: 'private',
  reviewState: 'draft',
  returnedNote: null,
  runnable: true,
  hasDraft: false,
  version: 1,
  updatedAt: '2026-10-08T00:00:00.000Z',
};

describe("a member's own app", () => {
  it('a private draft may be shared and submitted', () => {
    expect(spaceAppStatus(APP)).toBe('Private.');
    expect(spaceAppActions(APP)).toEqual({ run: true, share: 'team', submit: true, recall: false });
  });

  it('a shared app may go private again', () => {
    const shared = { ...APP, sharing: 'team' as const };
    expect(spaceAppStatus(shared)).toBe('Shared with the team.');
    expect(spaceAppActions(shared).share).toBe('private');
  });

  it('submit needs a published version and no pending changes', () => {
    expect(spaceAppActions({ ...APP, runnable: false }).submit).toBe(false);
    expect(spaceAppSubmitHint({ ...APP, runnable: false })).toMatch(/Publish it first/);
    expect(spaceAppActions({ ...APP, hasDraft: true }).submit).toBe(false);
    expect(spaceAppSubmitHint({ ...APP, hasDraft: true })).toMatch(/not published/);
    expect(spaceAppSubmitHint(APP)).toBeNull();
  });

  it('a submitted app is frozen: recall only', () => {
    const sub = { ...APP, reviewState: 'submitted' };
    expect(spaceAppStatus(sub)).toMatch(/Frozen/);
    // It says how it is shared and that the member may recall it.
    expect(spaceAppStatus(sub)).toMatch(/Private\./);
    expect(spaceAppStatus(sub)).toMatch(/recall/);
    expect(spaceAppActions(sub)).toEqual({ run: true, share: null, submit: false, recall: true });
    expect(spaceAppSubmitHint(sub)).toBeNull();
  });

  it('a returned app says so and may be submitted again', () => {
    const back = { ...APP, reviewState: 'returned', returnedNote: 'add a title' };
    expect(spaceAppStatus(back)).toBe('Returned by an admin. Private.');
    expect(spaceAppActions(back).submit).toBe(true);
  });

  it("a teammate's app only runs", () => {
    const theirs = { ...APP, mine: false, authorName: 'Sam', sharing: 'team' as const };
    expect(spaceAppStatus(theirs)).toBe('Shared by Sam');
    expect(spaceAppActions(theirs)).toEqual({
      run: true,
      share: null,
      submit: false,
      recall: false,
    });
  });

  it('runs from the member list only with a published build', () => {
    expect(runnableSpaceApp([APP], APP.id.toUpperCase())).toBe(APP);
    expect(runnableSpaceApp([{ ...APP, runnable: false }], APP.id)).toBeNull();
    expect(runnableSpaceApp(undefined, APP.id)).toBeNull();
  });

  it('builds its paths', () => {
    expect(myAppActionPath(APP.id, 'submit')).toBe(`/api/member/my-apps/${APP.id}/submit`);
  });
});

describe("the admin's review", () => {
  it('reads the entry file first, then by path', () => {
    expect(
      submissionFiles({
        entry: 'App.tsx',
        files: { 'b.ts': 'b', 'App.tsx': 'a', 'a.ts': 'x' },
      }).map((f) => f.path),
    ).toEqual(['App.tsx', 'a.ts', 'b.ts']);
  });

  it('carries no dash in its words', () => {
    for (const t of [
      MY_APPS_HOWTO,
      APP_TRUST_TOOLS_HINT,
      ...Object.values(APP_ACCEPT_LEVEL_MEANING),
      spaceAppStatus({ ...APP, reviewState: 'submitted' }),
    ]) {
      expect(t, t).not.toMatch(DASHES);
    }
  });
});

describe('the accept confirm and the trust switch', () => {
  it('states the version, the level and the trust choice as sent', () => {
    expect(acceptSummary({ level: 'team', trust: false, version: 4 })).toEqual([
      'Version 4, the one you read.',
      APP_ACCEPT_LEVEL_MEANING.team,
      'Its tools run at team rules for everyone, admins too.',
    ]);
    expect(acceptSummary({ level: 'admin', trust: true, version: 2 })[2]).toMatch(
      /whoever runs it/,
    );
  });

  it('reads the ceiling only as the brain sent it', () => {
    expect(appAuthorLevel({ authorLevel: 'team' })).toBe('team');
    expect(appAuthorLevel({ authorLevel: 'admin' })).toBe('admin');
    expect(appAuthorLevel({})).toBeNull();
  });

  it('says what the trust gives the code, with no dash', () => {
    expect(APP_TRUST_TOOLS_HINT).toMatch(/with your reach/);
    expect(APP_TRUST_TOOLS_HINT).toMatch(/Read the source/);
    expect(MY_APPS_HOWTO).toMatch(/Write switch/);
    for (const t of [APP_TRUST_OFF_HINT, MY_APP_SHARE_HINT, MY_APP_SUBMIT_HINT]) {
      expect(t).not.toMatch(DASHES);
    }
  });
});

describe('the trust switch on an app in the brain', () => {
  it('shows while the brain says the app ever ran at the ceiling, on or off', () => {
    expect(showsTrustSwitch({ authorLevel: 'admin', authorCeilingSeen: true })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'team', authorCeilingSeen: true })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'admin', authorCeilingSeen: false })).toBe(false);
    // A brain before the flag: only while capped.
    expect(showsTrustSwitch({ authorLevel: 'team' })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'admin' })).toBe(false);
  });

  it('speaks of code the admin did not write', () => {
    expect(APP_TRUST_CONFIRM).toMatch(/code you did not write/);
    expect(APP_TRUST_CONFIRM).not.toMatch(DASHES);
  });
});

// Access matrix N2: the admin's view of members' apps.
describe("an admin's view of a member app", () => {
  const app = {
    id: '11111111-2222-4333-8444-555555555555',
    title: 'Tally',
    author: { loginId: 'l', name: 'Sam', active: true },
    sharing: 'team' as const,
    reviewState: 'draft',
    runnable: true,
    declaredTools: [],
    updatedAt: '2026-10-08T00:00:00.000Z',
  };

  it('says who built it and who runs it', () => {
    expect(adminMemberAppStatus(app)).toBe('By Sam. Shared with the team: every member runs it.');
    expect(adminMemberAppStatus({ ...app, reviewState: 'submitted' })).toMatch(/Submitted/);
    expect(adminMemberAppStatus({ ...app, author: { ...app.author, active: false } })).toMatch(
      /runs for nobody/,
    );
  });

  it('deletes only with a snapshot kept, says how to restore it, and builds its paths', () => {
    expect(MEMBER_APP_DELETE_CONFIRM).toMatch(/snapshot/);
    // M4 audit: the brain keeps it in its trash; the copy says for how long.
    expect(MEMBER_APP_DELETE_CONFIRM).toMatch(/restore it for 30 days/);
    expect(MEMBER_APP_DELETED_TOAST).toMatch(/Recently deleted apps/);
    for (const text of [MEMBER_APP_DELETE_CONFIRM, MEMBER_APP_DELETED_TOAST]) {
      expect(text).not.toMatch(DASHES);
    }
    expect(memberAppAdminPath(app.id, 'delete')).toBe(
      `/api/team-admin/member-apps/${app.id}/delete`,
    );
    expect(deletedAppRestorePath(app.id)).toBe(`/api/apps/deleted/${app.id}/restore`);
  });
});

// M4 audit (jackdaw low 2, low 3): an app's activity in plain words, with
// who, a mark on writes, and the write's input.
describe("a member app's activity", () => {
  it('names what happened in plain words, never the raw kind', () => {
    expect(activityLabel({ kind: 'auth', detail: { via: 'member' } })).toBe('Opened');
    expect(activityLabel({ kind: 'tool', detail: { slug: 'note_list' } })).toBe('Used note_list');
    expect(activityLabel({ kind: 'db', detail: { op: 'exec' } })).toBe('Changed data');
    expect(activityLabel({ kind: 'error', detail: null })).toBe('Error');
    expect(activityLabel({ kind: 'something-new', detail: null })).toBe('Activity');
  });

  it('says who, by name or by how they came in', () => {
    expect(activityWho({ contactName: 'Sam', detail: { via: 'member' } })).toBe('Sam');
    expect(activityWho({ contactName: null, detail: { via: 'client' } })).toBe('A client');
    expect(activityWho({ contactName: null, detail: null })).toBe('Someone');
  });

  it('marks a write and keeps its input; a read or a refusal is not a write', () => {
    expect(activityWrite({ detail: { write: true, input: '{"id":1}' } })).toEqual({
      input: '{"id":1}',
    });
    expect(activityWrite({ detail: { write: true } })).toEqual({ input: null });
    expect(activityWrite({ detail: { slug: 'x' } })).toBeNull();
    expect(activityRefused({ detail: { refused: 'read-only' } })).toBe('read-only');
    expect(activityRefused({ detail: {} })).toBeNull();
  });
});
