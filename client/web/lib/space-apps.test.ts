import { describe, expect, it } from 'vitest';
import {
  activityLabel,
  activityRefused,
  activityWho,
  activityWrite,
  deletedAppRestorePath,
  MEMBER_APP_DELETED_TOAST,
  MEMBER_APP_DELETE_CONFIRM,
  REVIEW_TEST_BLOCKED,
  REVIEW_TEST_ENDED,
  REVIEW_TEST_NOTE,
  reviewAppChanged,
  reviewBrokerOutcome,
  reviewAppHref,
  reviewAppPath,
  reviewBannerText,
  reviewKind,
  sendBackConfirm,
  sharedAppMeta,
  waitingInAppsLabel,
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

  it('a sent back app says so, with no note, and may be submitted again', () => {
    const back = { ...APP, reviewState: 'returned' };
    expect(spaceAppStatus(back)).toBe(
      'Sent back by an admin. Private. Change it and submit it again.',
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

// Workspace review pattern (2026-10-09): members' apps in the admin's Apps.
describe("an admin's review of a member app, in Apps", () => {
  const author = { loginId: 'l', name: 'Sam', active: true };
  const shared = {
    id: '11111111-2222-4333-8444-555555555555',
    title: 'Tally',
    icon: null,
    color: null,
    author,
    lastActivityAt: '2026-10-08T00:00:00.000Z',
    runnable: true,
  };

  it('says who sent it and what waits, in the banner', () => {
    expect(reviewBannerText({ reviewState: 'submitted', author })).toBe(
      'Submitted by Sam. Waiting for your approval.',
    );
    expect(reviewBannerText({ reviewState: 'draft', author })).toBe('Shared with the team by Sam.');
    expect(reviewBannerText({ reviewState: 'returned', author: { ...author, name: null } })).toBe(
      'Shared with the team by a member.',
    );
    expect(reviewKind({ reviewState: 'submitted' })).toBe('waiting');
    expect(reviewKind({ reviewState: 'draft' })).toBe('shared');
  });

  it('says when a shared app runs for nobody', () => {
    expect(sharedAppMeta(shared, 'today')).toBe('Sam · last used today');
    expect(sharedAppMeta({ ...shared, author: { ...author, active: false } }, 'x')).toMatch(
      /runs for nobody/,
    );
  });

  it('says where Send back takes it, with no note', () => {
    expect(sendBackConfirm({ author })).toBe(
      'It goes back to Sam. They can change it and submit it again.',
    );
  });

  it('reads what a test broker answer means', () => {
    expect(reviewBrokerOutcome(409, { ok: false, reason: 'test-ended' })).toBe('ended');
    expect(reviewBrokerOutcome(403, { ok: false, reason: 'review-test-read-only' })).toBe(
      'blocked',
    );
    // A plain refusal (an undeclared tool) or another conflict is not ours.
    expect(reviewBrokerOutcome(403, { ok: false, error: 'x' })).toBeNull();
    expect(reviewBrokerOutcome(409, { ok: false, reason: 'changed' })).toBeNull();
    expect(reviewBrokerOutcome(200, null)).toBeNull();
    expect(REVIEW_TEST_BLOCKED).toBe('Test mode blocks tools that change data.');
    expect(reviewAppChanged(3)).toMatch(/now version 3/);
  });

  it('links to Apps from Team admin only when something waits', () => {
    expect(waitingInAppsLabel(0)).toBeNull();
    expect(waitingInAppsLabel(2)).toBe('2 waiting in Apps');
  });

  it('deletes only with a snapshot kept, says how to restore it, and builds its paths', () => {
    expect(MEMBER_APP_DELETE_CONFIRM).toMatch(/snapshot/);
    // M4 audit: the brain keeps it in its trash; the copy says for how long.
    expect(MEMBER_APP_DELETE_CONFIRM).toMatch(/restore it for 30 days/);
    expect(MEMBER_APP_DELETED_TOAST).toMatch(/Recently deleted apps/);
    expect(reviewAppPath(shared.id, 'delete')).toBe(`/api/apps/members/${shared.id}/delete`);
    expect(reviewAppPath(shared.id, 'send-back')).toBe(`/api/apps/members/${shared.id}/send-back`);
    expect(reviewAppPath(shared.id)).toBe(`/api/apps/members/${shared.id}`);
    expect(reviewAppHref(shared.id)).toBe(`/apps/review/${shared.id}`);
    expect(deletedAppRestorePath(shared.id)).toBe(`/api/apps/deleted/${shared.id}/restore`);
  });

  it('carries no dash in its words', () => {
    for (const text of [
      MEMBER_APP_DELETE_CONFIRM,
      MEMBER_APP_DELETED_TOAST,
      REVIEW_TEST_NOTE,
      REVIEW_TEST_ENDED,
      REVIEW_TEST_BLOCKED,
      reviewAppChanged(2),
      sendBackConfirm({ author }),
      reviewBannerText({ reviewState: 'submitted', author }),
    ]) {
      expect(text, text).not.toMatch(DASHES);
    }
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
