import { describe, expect, it } from 'vitest';
import { hubAppLevelChanged, hubAppSetMessage } from './hub-app';

describe('hubAppLevelChanged', () => {
  it('reads levelChanged (mantle 0.232.297 and later)', () => {
    expect(hubAppLevelChanged({ levelChanged: true })).toBe(true);
    expect(hubAppLevelChanged({ levelChanged: false })).toBe(false);
  });

  it('prefers levelChanged over the retired modeChanged', () => {
    expect(hubAppLevelChanged({ levelChanged: false, modeChanged: true })).toBe(false);
    expect(hubAppLevelChanged({ levelChanged: true, modeChanged: false })).toBe(true);
  });

  it('falls back to modeChanged from an older brain', () => {
    expect(hubAppLevelChanged({ modeChanged: true })).toBe(true);
    expect(hubAppLevelChanged({ modeChanged: false })).toBe(false);
  });

  it('is false when the brain says neither', () => {
    expect(hubAppLevelChanged({ appId: 'a' })).toBe(false);
    expect(hubAppLevelChanged(undefined)).toBe(false);
    expect(hubAppLevelChanged(null)).toBe(false);
  });
});

describe('hubAppSetMessage', () => {
  it('says a moved app is visible to team members at Team level', () => {
    const text = hubAppSetMessage({ levelChanged: true });
    expect(text).toMatch(/Team level/);
    expect(text).toMatch(/every team member/);
  });

  it('says the same for an older brain that sends only modeChanged', () => {
    expect(hubAppSetMessage({ modeChanged: true })).toBe(hubAppSetMessage({ levelChanged: true }));
  });

  it('never promises a team-only link (team links are retired)', () => {
    for (const res of [{ levelChanged: true }, { modeChanged: true }, { levelChanged: false }]) {
      expect(hubAppSetMessage(res)).not.toMatch(/link|members-only|members only/i);
    }
  });

  it('says only that it is set when the level did not change', () => {
    expect(hubAppSetMessage({ levelChanged: false })).toBe(
      'Home app set. Members see it as their home.',
    );
  });
});
