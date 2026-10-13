import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';

/** The kept Team settings route (W5c brain contract): the read posture (the
 *  member home app went with task d78e7bde; the Team assistant, which the
 *  brain answers null since migration 0286, is not read). */
export const TEAM_SETTINGS_PATH = '/api/team-admin/settings';

export const TEAM_SETTINGS_KEY = ['workspaces', 'team-settings'] as const;

/** GET /api/team-admin/settings, the fields the Team settings read. */
export type TeamSettings = {
  privateReads: boolean;
};

export function useTeamSettings(enabled = true) {
  return useQuery({
    queryKey: TEAM_SETTINGS_KEY,
    queryFn: () => apiFetch<TeamSettings>(TEAM_SETTINGS_PATH),
    enabled,
  });
}
