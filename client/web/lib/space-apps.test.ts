import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  isMyAppInTrash,
  myAppDeleteConfirm,
  myAppRefusal,
  myAppSnapshotPath,
  MY_APP_DELETED_TOAST,
  MY_APP_IN_TRASH,
  MY_APP_RESTORED_TOAST,
  MY_APP_SNAPSHOT_DELETED_TOAST,
  MY_APPS_DELETED_KEY,
  MY_APPS_DELETED_PATH,
  MY_APPS_KEY,
  MY_APPS_MAX,
  MY_APPS_TRASH_INFO,
  MY_APPS_TRASH_MAX,
  deletedAppRestorePath,
  waitingInAppsLabel,
  appAuthorLevel,
  APP_TRUST_CONFIRM,
  showsTrustSwitch,
  APP_TRUST_OFF_HINT,
  MY_APP_SHARE_HINT,
  MY_APP_SUBMIT_HINT,
  MY_APPS_HOWTO,
  myAppActionPath,
  runnableSpaceApp,
  spaceAppActions,
  spaceAppStatus,
  spaceAppSubmitHint,
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

  it('a rejected app says so, with no note, and may be submitted again', () => {
    const back = { ...APP, reviewState: 'returned' };
    expect(spaceAppStatus(back)).toBe(
      'Rejected by an admin. Private. Change it and submit it again.',
    );
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

describe('the words around a member app', () => {
  it('carry no dash', () => {
    for (const t of [
      MY_APPS_HOWTO,
      APP_TRUST_OFF_HINT,
      MY_APP_SHARE_HINT,
      MY_APP_SUBMIT_HINT,
      spaceAppStatus({ ...APP, reviewState: 'submitted' }),
    ]) {
      expect(t, t).not.toMatch(DASHES);
    }
    expect(MY_APPS_HOWTO).toMatch(/Write switch/);
  });

  it('reads the ceiling only as the brain sent it', () => {
    expect(appAuthorLevel({ authorLevel: 'team' })).toBe('team');
    expect(appAuthorLevel({ authorLevel: 'admin' })).toBe('admin');
    expect(appAuthorLevel({})).toBeNull();
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

describe('Team admin and the trash of brain apps', () => {
  it('links to Apps from Team admin only when something waits', () => {
    expect(waitingInAppsLabel(0)).toBeNull();
    expect(waitingInAppsLabel(2)).toBe('2 waiting in Apps');
  });

  it('builds the restore path of a deleted app', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(deletedAppRestorePath(id)).toBe(`/api/apps/deleted/${id}/restore`);
  });
});

describe('a member’s own trash (access matrix N6)', () => {
  const refused = (status: number, reason?: string) =>
    new ApiError('the brain’s words', status, reason ? { reason } : undefined);

  it('builds the trash, restore and snapshot paths', () => {
    expect(myAppActionPath('a b', 'delete')).toBe('/api/member/my-apps/a%20b/delete');
    expect(myAppActionPath('x', 'undelete')).toBe('/api/member/my-apps/x/undelete');
    expect(MY_APPS_DELETED_PATH).toBe('/api/member/my-apps/deleted');
    expect(myAppSnapshotPath('x', 's/1')).toBe('/api/member/my-apps/x/history/s%2F1');
  });

  it('keeps the trash under the apps key, so every app change refreshes it', () => {
    expect(MY_APPS_DELETED_KEY.slice(0, MY_APPS_KEY.length)).toEqual([...MY_APPS_KEY]);
  });

  it('asks a short question before Delete, with the way back', () => {
    expect(myAppDeleteConfirm('Snag list')).toEqual({
      title: 'Move Snag list to Trash?',
      body: 'You can restore it from Trash.',
    });
    expect(myAppDeleteConfirm('  ').title).toBe('Move Untitled to Trash?');
  });

  it('knows a trashed app only by 409 deleted', () => {
    expect(isMyAppInTrash(refused(409, 'deleted'))).toBe(true);
    expect(isMyAppInTrash(refused(404, 'deleted'))).toBe(false);
    expect(isMyAppInTrash(refused(409, 'frozen'))).toBe(false);
    expect(isMyAppInTrash(new Error('x'))).toBe(false);
    expect(isMyAppInTrash(null)).toBe(false);
  });

  it('says each refusal plainly, with the 50 app limits', () => {
    expect(myAppRefusal(refused(409, 'deleted'))).toBe(MY_APP_IN_TRASH);
    expect(myAppRefusal(refused(409, 'limit'))).toBe(
      `You already have ${MY_APPS_MAX} apps, the most one member keeps. Delete one you no longer need, then restore this one.`,
    );
    expect(myAppRefusal(refused(409, 'trash-full'))).toContain(`at most ${MY_APPS_TRASH_MAX} apps`);
    expect(myAppRefusal(refused(409, 'not-yours'))).toBe(
      'You can delete only snapshots you took yourself.',
    );
    expect(myAppRefusal(refused(409, 'frozen'))).toMatch(/frozen/);
    // Anything else: the brain's own message.
    expect(myAppRefusal(refused(409, 'other'))).toBeNull();
    expect(myAppRefusal(refused(500))).toBeNull();
    expect(MY_APPS_MAX).toBe(50);
    expect(MY_APPS_TRASH_MAX).toBe(50);
  });

  it('writes no submit or review words, no em dashes and no MCP tool names', () => {
    const lines = [
      ...MY_APPS_TRASH_INFO,
      MY_APP_IN_TRASH,
      MY_APP_DELETED_TOAST,
      MY_APP_RESTORED_TOAST,
      MY_APP_SNAPSHOT_DELETED_TOAST,
      ...Object.values(myAppDeleteConfirm('A')),
      ...['deleted', 'limit', 'trash-full', 'not-yours', 'frozen'].map((r) =>
        myAppRefusal(refused(409, r))!,
      ),
    ];
    for (const l of lines) {
      expect(l).not.toMatch(/submit|review|approv|my_app|—|–/i);
    }
  });
});
