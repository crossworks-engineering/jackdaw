import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { TeamAgentAccess } from '@/lib/team-agent-access';

/** The kept Team settings route (W5c brain contract): the team agent, the
 *  read posture and the member home app. */
export const TEAM_SETTINGS_PATH = '/api/team-admin/settings';

export const TEAM_SETTINGS_KEY = ['workspaces', 'team-settings'] as const;

/** GET /api/team-admin/settings, the fields the Team settings read. */
export type TeamSettings = {
  privateReads: boolean;
  hubAppId: string | null;
  hubCandidates: Array<{ id: string; title: string }>;
  /** The team agent and its level; absent on a brain before the field. */
  teamAgent?: TeamAgentAccess | null;
};

export function useTeamSettings(enabled = true) {
  return useQuery({
    queryKey: TEAM_SETTINGS_KEY,
    queryFn: () => apiFetch<TeamSettings>(TEAM_SETTINGS_PATH),
    enabled,
  });
}
