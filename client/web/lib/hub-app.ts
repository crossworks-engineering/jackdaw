import { ApiError } from '@mantle/web-ui/api-fetch';

/**
 * The home app designation's answer (PUT /api/team-admin/hub-app). Pure, so
 * the rule is unit-tested (hub-app.test.ts).
 *
 * Since W5b2 (contract 31) nothing changes level: the brain designates only
 * an app the Team workspace reads, and refuses any other with 409
 * `not_in_team` (share it with Team in its Access panel first). The answer
 * keeps `levelChanged: false` for older clients; a brain before W5b2 could
 * still say true. No link is made.
 */
export type HubAppSetResponse = {
  appId?: string;
  levelChanged?: boolean;
};

/** Did designating move the app from admin to team? */
export function hubAppLevelChanged(res: HubAppSetResponse | null | undefined): boolean {
  return res?.levelChanged ?? false;
}

/** The brain's refusal of an app the Team workspace does not read. */
export function isNotInTeam(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.body?.code === 'not_in_team';
}

/** What the picker says when the brain refuses an app Team does not read. */
export const HUB_NOT_IN_TEAM_TEXT =
  'Team cannot see this app. Open the app, add Team in its Access panel, then choose it again.';

/** The toast after a home app is set. */
export function hubAppSetMessage(res: HubAppSetResponse | null | undefined): string {
  return hubAppLevelChanged(res)
    ? 'Home app set. It is now at Team level, so every team member can see and run it.'
    : 'Home app set. Members see it as their home.';
}
