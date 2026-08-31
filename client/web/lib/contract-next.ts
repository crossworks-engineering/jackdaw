import type { ActivityItem } from '@mantle/client-types/journey-format';

/**
 * TEMPORARY shim for contract fields the server ships but the pinned
 * `@crossworks/client-types` (0.232.82) does not know yet:
 *
 *   - ActivityItem agent identity (agentId/agentName/agentSlug/avatarSeed/
 *     workerSlug/parentTraceId)
 *   - AgentDTO.experience (XP level readout)
 *
 * Everything reads defensively (an older brain simply sends nothing), so this
 * file is safe against every server version. DELETE it — and inline the real
 * types — once the pin advances past the mantle release that carries them.
 */

export type AgentExperience = {
  level: number;
  xp: number;
  levelXp: number;
  nextLevelXp: number;
  components: {
    turns: number;
    toolSuccesses: number;
    delegations: number;
    heartbeats: number;
  };
};

export type ActivityAgentFields = {
  agentId: string | null;
  agentName: string | null;
  agentSlug: string | null;
  avatarSeed: string | null;
  workerSlug: string | null;
  parentTraceId: string | null;
};

/** The identity fields off an activity item, null-safe on any server version. */
export function activityAgent(it: ActivityItem): ActivityAgentFields {
  const x = it as ActivityItem & Partial<ActivityAgentFields>;
  return {
    agentId: x.agentId ?? null,
    agentName: x.agentName ?? null,
    agentSlug: x.agentSlug ?? null,
    avatarSeed: x.avatarSeed ?? null,
    workerSlug: x.workerSlug ?? null,
    parentTraceId: x.parentTraceId ?? null,
  };
}

/** The experience readout off an agent payload, or null when the brain
 *  predates it / the read skipped it. */
export function experienceOf(agent: unknown): AgentExperience | null {
  const e = (agent as { experience?: unknown } | null)?.experience;
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  if (typeof x.level !== 'number' || typeof x.xp !== 'number') return null;
  return e as AgentExperience;
}

/** Hover text that shows WHY the agent is level N — the honesty rule: the
 *  level never claims history it cannot show. */
export function experienceTitle(e: AgentExperience): string {
  const c = e.components;
  const bits = [
    `${c.turns} turn${c.turns === 1 ? '' : 's'}`,
    `${c.toolSuccesses} tool success${c.toolSuccesses === 1 ? '' : 'es'}`,
  ];
  if (c.delegations > 0) bits.push(`${c.delegations} delegation${c.delegations === 1 ? '' : 's'}`);
  if (c.heartbeats > 0) bits.push(`${c.heartbeats} heartbeat${c.heartbeats === 1 ? '' : 's'}`);
  return `Level ${e.level} · ${bits.join(' · ')} · ${e.xp} XP`;
}
