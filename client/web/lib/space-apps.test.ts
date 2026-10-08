import { describe, expect, it } from 'vitest';
import {
  APP_ACCEPT_LEVEL_MEANING,
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
