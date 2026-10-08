/**
 * A tool group's level (its `audience`): admin > team > client > public. An
 * agent may hold a group only at a level it reads (a team agent holds team,
 * client and public groups; client and public are siblings), and a team app
 * calls a built-in tool only while an ENABLED group at team level or lower
 * holds it. An MCP CONNECTOR group's level also decides who may use its
 * tools, on their own MCP and in apps (brain team apps Phase 2), and a tool's
 * read-only mark decides read or write. A single http tool follows its own
 * "External access" switch. Set with `PATCH /api/access/tool-groups/:slug { audience }`;
 * the brain refuses a level that an agent holding the group cannot read
 * (code `group_above_agent`, naming each agent). See the brain's
 * docs/access-levels.md and docs/member-logins.md "External access: outside tools in shared apps".
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

/**
 * A CONNECTOR group's level (brain team apps Phase 2): it decides who may use
 * the connector's tools, as the level on an item does, on their own MCP and
 * in the apps they run. A tool without the read-only mark changes data.
 */
export const CONNECTOR_LEVEL_MEANING: Record<AccessLevel, string> = {
  admin:
    'Admin: only admins and admin agents use this connector. Members, clients and shared apps cannot.',
  team: 'Team: members use every tool of this connector, from their own MCP and in the apps they run. Tools without the read-only mark can change data.',
  client:
    'Client: clients use it too, from their own MCP and in client apps, and so do members. Tools without the read-only mark can change data.',
  public:
    'Public: members use every tool; contacts on an app’s contact link and public agents granted it use only its read-only tools. Not clients: they use client-level connectors only.',
};

/**
 * The second line of the confirm dialog before a connector moves to `level`.
 * Contacts and public agents only ever get the tools marked read-only
 * (contacts read only, brain team apps Phase 2).
 */
export function connectorLevelConfirmNote(level: AccessLevel): string {
  const all =
    'Everyone at this level may use every tool of this connector, the ones that change data included, and read everything it reaches. Keep a source with secret parts at admin level.';
  if (level !== 'public') return all;
  return `${all} Contacts and public agents get only the tools marked read-only.`;
}

/** Is this group an MCP connector (its level then opens its tools to logins
 *  and apps). An OpenAPI or plain group is not. */
export function isConnectorGroup(group: { integration?: { mcp?: unknown } | null }): boolean {
  return !!group.integration?.mcp;
}

/** The line under the level selector, for a connector or any other group. */
export function groupLevelMeaning(
  group: { integration?: { mcp?: unknown } | null },
  level: AccessLevel,
): string {
  return isConnectorGroup(group) ? CONNECTOR_LEVEL_MEANING[level] : GROUP_LEVEL_MEANING[level];
}

/** A connector below admin opens its tools to members, clients or links:
 *  every move below admin asks first. */
export function connectorLevelNeedsConfirm(
  from: AccessLevel | undefined,
  to: AccessLevel,
): boolean {
  return from !== to && to !== 'admin';
}

/** Shown in place of the selector when the brain does not send the level. */
export const GROUP_LEVEL_UNKNOWN = 'Update the brain to change levels here.';

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
 * The connector group of an MCP tool when it is switched OFF: then nobody
 * can call the tool, External access or not (the brain refuses a disabled
 * connector on every call). Null for any other tool, or when the connector
 * is on or not in the list.
 */
export function connectorOff(
  groups: readonly ToolGroupWithLevel[],
  handler: { kind: string; group?: string },
): ToolGroupWithLevel | null {
  if (handler.kind !== 'mcp' || !handler.group) return null;
  const g = groups.find((x) => x.slug === handler.group);
  return g && !g.enabled ? g : null;
}

/** The tool groups screen opened on one group. */
export function toolGroupHref(slug: string): string {
  return `/settings/tool-groups?selected=${encodeURIComponent(slug)}`;
}
