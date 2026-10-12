import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { TeamAssistant } from '@/lib/team-assistant';

/** The kept Team settings route (W5c brain contract): the Team assistant
 *  and the read posture (the member home app went with task d78e7bde). */
export const TEAM_SETTINGS_PATH = '/api/team-admin/settings';

export const TEAM_SETTINGS_KEY = ['workspaces', 'team-settings'] as const;

/** GET /api/team-admin/settings, the fields the Team settings read. */
export type TeamSettings = {
  privateReads: boolean;
  /** The Team workspace's assistant members chat with; null when it has
   *  none (brain b017d1874: replaces `teamAgent`, no level). */
  teamAssistant: TeamAssistant | null;
};

export function useTeamSettings(enabled = true) {
  return useQuery({
    queryKey: TEAM_SETTINGS_KEY,
    queryFn: () => apiFetch<TeamSettings>(TEAM_SETTINGS_PATH),
    enabled,
  });
}
