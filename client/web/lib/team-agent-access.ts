/**
 * The team agent's level, as Team > Settings shows it. A member login chats
 * only with a Team-level agent, and the team agent ships at Admin level, so
 * members cannot chat until the owner moves it. The brain reports the agent
 * on GET /api/team-admin/settings (`teamAgent`) and changes it with
 * PATCH /api/access/agents/:slug.
 */
import type { AccessLevel } from '@mantle/client-types';

/** `teamAgent` on GET /api/team-admin/settings: null when the brain has no
 *  team agent. Absent on a brain from before the field. */
export type TeamAgentAccess = {
  slug: string;
  name: string;
  audience: AccessLevel;
  enabled: boolean;
};

/** on: members can chat. off: the agent is above Team (or below it).
 *  missing: no team agent on this brain. unknown: the brain does not say. */
export type TeamAgentState = 'on' | 'off' | 'missing' | 'unknown';

export function teamAgentState(agent: TeamAgentAccess | null | undefined): TeamAgentState {
  if (agent === undefined) return 'unknown';
  if (agent === null) return 'missing';
  return agent.audience === 'team' ? 'on' : 'off';
}

/** The PATCH body that opens member chat. `dropGroupsAbove` takes the tool
 *  groups above Team off the agent in the same step (the brain refuses the
 *  change while the agent holds one). */
export const OPEN_TEAM_CHAT_BODY = { audience: 'team', dropGroupsAbove: true } as const;

/** The PATCH body that closes it again: back to Admin, the shipped level.
 *  Raising a level never conflicts with a group, so nothing is dropped. */
export const CLOSE_TEAM_CHAT_BODY = { audience: 'admin' } as const;

export function teamAgentPath(slug: string): string {
  return `/api/access/agents/${encodeURIComponent(slug)}`;
}

/** The toast after member chat opens: names the tool groups that left. */
export function openedMessage(name: string, removedGroups: readonly string[]): string {
  const base = `Members can now chat with ${name}.`;
  if (removedGroups.length === 0) return base;
  const list = removedGroups.join(', ');
  return `${base} Removed tool ${removedGroups.length === 1 ? 'group' : 'groups'} above Team: ${list}.`;
}
