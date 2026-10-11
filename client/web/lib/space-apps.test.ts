import { describe, expect, it } from 'vitest';
import {
  APP_TRUST_CONFIRM,
  APP_TRUST_OFF_HINT,
  appAuthorLevel,
  deletedAppRestorePath,
  showsTrustSwitch,
} from './space-apps';

/** An en or an em dash, named by code point so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('the trust switch on an app in the brain', () => {
  it('reads the ceiling only as the brain sent it', () => {
    expect(appAuthorLevel({ authorLevel: 'team' })).toBe('team');
    expect(appAuthorLevel({ authorLevel: 'admin' })).toBe('admin');
    expect(appAuthorLevel({})).toBeNull();
  });

  it('shows while the brain says the app ever ran at the ceiling, on or off', () => {
    expect(showsTrustSwitch({ authorLevel: 'admin', authorCeilingSeen: true })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'team', authorCeilingSeen: true })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'admin', authorCeilingSeen: false })).toBe(false);
    // A brain before the flag: only while capped.
    expect(showsTrustSwitch({ authorLevel: 'team' })).toBe(true);
    expect(showsTrustSwitch({ authorLevel: 'admin' })).toBe(false);
  });

  it('speaks of code the admin did not write, with no dash', () => {
    expect(APP_TRUST_CONFIRM).toMatch(/code you did not write/);
    expect(APP_TRUST_CONFIRM).not.toMatch(DASHES);
    expect(APP_TRUST_OFF_HINT).not.toMatch(DASHES);
  });
});

describe('the trash of brain apps', () => {
  it('builds the restore path of a deleted app', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(deletedAppRestorePath(id)).toBe(`/api/apps/deleted/${id}/restore`);
  });
});
