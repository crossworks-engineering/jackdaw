/**
 * Where a tool's reach shows: the tool groups that hold it, a link to one,
 * and a switched-off connector. Nothing has a level any more (workspaces
 * W7b): `PATCH /api/access/tool-groups/:slug` answers 410, and people and
 * apps reach a connector through the workspaces that hold it.
 *
 * Pure: no React, so the rules are unit-tested (tool-group-links.test.ts).
 */
import type { ToolGroupWithRefs } from '@mantle/client-types';

/** The group as GET /api/tool-groups sends it. */
export type ToolGroupRow = ToolGroupWithRefs;

/** Is this group an MCP connector. An OpenAPI or plain group is not. */
export function isConnectorGroup(group: { integration?: { mcp?: unknown } | null }): boolean {
  return !!group.integration?.mcp;
}

/** The groups that hold `toolSlug`, enabled ones first, then by name. */
export function groupsHolding(groups: readonly ToolGroupRow[], toolSlug: string): ToolGroupRow[] {
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
  groups: readonly ToolGroupRow[],
  handler: { kind: string; group?: string },
): ToolGroupRow | null {
  if (handler.kind !== 'mcp' || !handler.group) return null;
  const g = groups.find((x) => x.slug === handler.group);
  return g && !g.enabled ? g : null;
}

/** The tool groups screen opened on one group. */
export function toolGroupHref(slug: string): string {
  return `/settings/tool-groups?selected=${encodeURIComponent(slug)}`;
}
