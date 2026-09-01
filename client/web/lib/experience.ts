import type { AgentExperienceDTO } from '@mantle/client-types';

/**
 * Agent experience display helpers, typed against the contract proper
 * (the pin carries `AgentExperienceDTO` since 0.232.105 — this replaces the
 * temporary contract-next.ts shim).
 *
 * `experienceOf` still validates at runtime: the TYPE guarantees the shape
 * when the payload is current, but an older BRAIN on the wire simply omits
 * or truncates the field, and the level readout must fail closed to null —
 * never throw in render.
 */
export function experienceOf(agent: unknown): AgentExperienceDTO | null {
  const e = (agent as { experience?: unknown } | null)?.experience;
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  if (typeof x.level !== 'number' || typeof x.xp !== 'number') return null;
  // experienceTitle dereferences components — a payload without it (some
  // intermediate server build) must fail closed here, not throw in render.
  const c = x.components as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== 'object' || typeof c.turns !== 'number') return null;
  return e as AgentExperienceDTO;
}

/** Hover text that shows WHY the agent is level N — the honesty rule: the
 *  level never claims history it cannot show. */
export function experienceTitle(e: AgentExperienceDTO): string {
  const c = e.components;
  const bits = [
    `${c.turns} turn${c.turns === 1 ? '' : 's'}`,
    `${c.toolSuccesses} tool success${c.toolSuccesses === 1 ? '' : 'es'}`,
  ];
  if (c.delegations > 0) bits.push(`${c.delegations} delegation${c.delegations === 1 ? '' : 's'}`);
  if (c.heartbeats > 0) bits.push(`${c.heartbeats} heartbeat${c.heartbeats === 1 ? '' : 's'}`);
  return `Level ${e.level} · ${bits.join(' · ')} · ${e.xp} XP`;
}
