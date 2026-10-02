/**
 * A tool group's level (its `audience`): admin > team > client > public. An
 * agent may hold a group only at a level it reads (a team agent holds team,
 * client and public groups; client and public are siblings), and a team app
 * calls an outside tool only while an ENABLED group at team level or lower
 * holds it. Set with `PATCH /api/access/tool-groups/:slug { audience }`;
 * the brain refuses a level that an agent holding the group cannot read
 * (code `group_above_agent`, naming each agent). See the brain's
 * docs/access-levels.md and docs/member-logins.md "Outside tools in team apps".
 *
 * Pure: no React, so the rules are unit-tested (tool-group-level.test.ts).
 */
import type { AccessLevel, ToolGroupWithRefs } from '@mantle/client-types';

/**
 * The group as GET /api/tool-groups sends it, plus `audience`. Optional: a
 * brain before the field shipped leaves it out. Local until the published
 * contract carries it.
 */
export type ToolGroupWithLevel = ToolGroupWithRefs & { audience?: AccessLevel };

/** One line under the selector: who may use the group's tools at this level. */
export const GROUP_LEVEL_MEANING: Record<AccessLevel, string> = {
  admin: 'Admin: only you and admin agents may use these tools.',
  team: "Team: team members' apps and the team assistant may use these tools, when granted.",
  client: 'Client: client agents may use these tools too, when granted. Team apps may as well.',
  public: 'Public: public agents may use these tools too, when granted. Team apps may as well.',
};

/** Shown in place of the selector when the brain does not send the level. */
export const GROUP_LEVEL_UNKNOWN = 'Update the brain to change levels here.';

/** The levels team apps reach (mantle MEMBER_GROUP_LEVELS). */
const TEAM_APP_LEVELS: readonly AccessLevel[] = ['team', 'client', 'public'];

/** Moving to client or public opens the tools past the team: confirm first. */
export function levelNeedsConfirm(from: AccessLevel | undefined, to: AccessLevel): boolean {
  return from !== to && (to === 'client' || to === 'public');
}

/** The groups that hold `toolSlug`, enabled ones first, then by name. */
export function groupsHolding(
  groups: readonly ToolGroupWithLevel[],
  toolSlug: string,
): ToolGroupWithLevel[] {
  return groups
    .filter((g) => g.toolSlugs.includes(toolSlug))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
}

/**
 * Whether team apps can reach `toolSlug` through its groups: `yes` when an
 * enabled group at team level or lower holds it, `no` when none does, and
 * `unknown` when a group that could decide it has no level (an older brain).
 */
export function teamAppsReach(
  groups: readonly ToolGroupWithLevel[],
  toolSlug: string,
): 'yes' | 'no' | 'unknown' {
  const enabled = groupsHolding(groups, toolSlug).filter((g) => g.enabled);
  if (enabled.some((g) => g.audience && TEAM_APP_LEVELS.includes(g.audience))) return 'yes';
  if (enabled.some((g) => g.audience === undefined)) return 'unknown';
  return 'no';
}

/** The tool groups screen opened on one group. */
export function toolGroupHref(slug: string): string {
  return `/settings/tool-groups?selected=${encodeURIComponent(slug)}`;
}
