/**
 * The home app designation's answer (PUT /api/team-admin/hub-app). Pure, so
 * the rule is unit-tested (hub-app.test.ts).
 *
 * `levelChanged`: the app was at admin and the brain moved it to team, so
 * every member can now see and run it. No link is made: team links are
 * retired (member logins Phase 6 stage 6). The brain answers exactly
 * `{ appId, levelChanged }`; the old `modeChanged` alias is retired and not
 * read.
 */
export type HubAppSetResponse = {
  appId?: string;
  levelChanged?: boolean;
};

/** Did designating move the app from admin to team? */
export function hubAppLevelChanged(res: HubAppSetResponse | null | undefined): boolean {
  return res?.levelChanged ?? false;
}

/** The toast after a home app is set. */
export function hubAppSetMessage(res: HubAppSetResponse | null | undefined): string {
  return hubAppLevelChanged(res)
    ? 'Home app set. It is now at Team level, so every team member can see and run it.'
    : 'Home app set. Members see it as their home.';
}
