/**
 * Thinking effort, the browser half: the agent select's options, the profile
 * label an agent on Inherit follows, and the cost warnings both screens show.
 *
 * The brain owns the rule (docs/thinking.md in the mantle repo): an agent's own
 * effort wins; Inherit (null) follows the person's profile, which reasons only
 * while live thinking is on AND the effort is above Off.
 *
 * Built on the tier vocabulary from the browser-safe leaf
 * `@mantle/content-core/thinking-tiers` (no imports), so the labels here and
 * the effort the brain sends cannot drift apart.
 */
import {
  THINKING_EFFORTS,
  THINKING_TIERS,
  thinkingEffortForBudget,
  type ThinkingEffort,
} from '@mantle/content-core/thinking-tiers';

/** An agent's own effort: 'off' or a tier. null = inherit the profile. */
export type AgentThinkingEffort = 'off' | ThinkingEffort;

/** Select options in order. The profile dropdown stops at High; an agent may
 *  also take the two upper rungs (the brain downgrades a rung a model lacks). */
export const AGENT_THINKING_EFFORT_OPTIONS: ReadonlyArray<{
  value: AgentThinkingEffort;
  label: string;
}> = [
  { value: 'off', label: 'Off' },
  ...THINKING_EFFORTS.map((e) => ({ value: e, label: effortLabel(e) })),
];

/** A tier's label: the profile tier's own where it has one. */
function effortLabel(e: ThinkingEffort): string {
  return (
    THINKING_TIERS.find((t) => t.effort === e)?.label ??
    (e === 'xhigh' ? 'Extra high' : e === 'max' ? 'Max' : e)
  );
}

/** Narrow a wire value. Anything unknown is null = inherit. */
export function parseAgentThinkingEffort(raw: unknown): AgentThinkingEffort | null {
  return AGENT_THINKING_EFFORT_OPTIONS.some((o) => o.value === raw)
    ? (raw as AgentThinkingEffort)
    : null;
}

/** The level an agent on Inherit gets from this profile, as a label. Mirrors
 *  the brain's double gate: the live-thinking switch off, or a budget of 0,
 *  means Off. */
export function profileThinkingLabel(prefs: {
  streamThoughts?: boolean;
  thinkingBudget?: number;
}): string {
  if (prefs.streamThoughts === false) return 'Off';
  const effort = thinkingEffortForBudget(prefs.thinkingBudget);
  return effort ? effortLabel(effort) : 'Off';
}

/** What each effort costs, in plain terms. Only the tiers that meaningfully
 *  change spend or latency say anything: a warning on every option is a
 *  warning on none. */
export const THINKING_EFFORT_WARNINGS: Partial<Record<string, string>> = {
  high: 'High makes the model reason at length before answering. Expect noticeably slower replies and materially higher token spend on every turn, because reasoning tokens are billed as output.',
  xhigh:
    'Extra high spends far more reasoning tokens than High, on every turn. Best reserved for genuinely hard work, not everyday chat.',
  max: 'Maximum tells the model to reason as deeply as it can, on every turn. This is the most expensive and slowest setting by a wide margin, so use it deliberately.',
};
