import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  HUB_NOT_IN_TEAM_TEXT,
  hubAppLevelChanged,
  hubAppSetMessage,
  isNotInTeam,
  type HubAppSetResponse,
} from './hub-app';

/** An answer carrying the retired alias, as a brain before 0.232.297 sent it. */
const retired = (modeChanged: boolean) => ({ modeChanged }) as unknown as HubAppSetResponse;

describe('hubAppLevelChanged', () => {
  it('reads levelChanged', () => {
    expect(hubAppLevelChanged({ levelChanged: true })).toBe(true);
    expect(hubAppLevelChanged({ levelChanged: false })).toBe(false);
  });

  it('no longer reads the retired modeChanged alias', () => {
    expect(hubAppLevelChanged(retired(true))).toBe(false);
    expect(hubAppSetMessage(retired(true))).toBe(hubAppSetMessage({ levelChanged: false }));
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

  it('never promises a team-only link (team links are retired)', () => {
    for (const res of [{ levelChanged: true }, { levelChanged: false }]) {
      expect(hubAppSetMessage(res)).not.toMatch(/link|members-only|members only/i);
    }
  });

  it('says only that it is set when the level did not change', () => {
    expect(hubAppSetMessage({ levelChanged: false })).toBe(
      'Home app set. Members see it as their home.',
    );
  });
});

describe('an app Team does not read (W5b2 contract 31)', () => {
  it('knows the 409 not_in_team refusal and says what to do', () => {
    const err = new ApiError('Share the app with Team in Grant Access first.', 409, {
      error: 'Share the app with Team in Grant Access first.',
      code: 'not_in_team',
    });
    expect(isNotInTeam(err)).toBe(true);
    expect(isNotInTeam(new ApiError('x', 409, { code: 'other' }))).toBe(false);
    expect(isNotInTeam(new Error('x'))).toBe(false);
    expect(HUB_NOT_IN_TEAM_TEXT).toMatch(/Access panel/);
    expect(HUB_NOT_IN_TEAM_TEXT).not.toMatch(/level/i);
  });

  it('a W5b2 answer (levelChanged false) only says it is set', () => {
    expect(hubAppSetMessage({ appId: 'a', levelChanged: false })).toBe(
      'Home app set. Members see it as their home.',
    );
  });
});
