import type { ToolHandler } from '@mantle/client-types';

/**
 * The client-side filter behind the Settings > Tools and Tool groups search
 * boxes. Both lists arrive whole (no paging), so filtering the loaded rows is
 * the honest thing here; the style guide's "search is URL-driven SSR" rule is
 * about paged lists, where a client filter would only see one page.
 *
 * Case-insensitive. Words are matched separately and must ALL hit, in any
 * field, so `mcp crm` finds the mcp tools of a connector called CRM.
 */
export function matchesQuery(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fields
    .filter((f): f is string => !!f)
    .join('\n')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

type SearchableTool = { slug: string; name: string; description: string; handler: ToolHandler };

/**
 * Slug, display name, description, handler kind, and for a connector (mcp)
 * tool its group: the slug the handler carries and, when the caller has the
 * tool groups loaded, that group's display name.
 */
export function filterTools<T extends SearchableTool>(
  tools: readonly T[],
  query: string,
  groupNames?: ReadonlyMap<string, string>,
): T[] {
  if (!query.trim()) return [...tools];
  return tools.filter((t) => {
    const group = t.handler.kind === 'mcp' ? t.handler.group : null;
    return matchesQuery(
      [t.slug, t.name, t.description, t.handler.kind, group, group && groupNames?.get(group)],
      query,
    );
  });
}

type SearchableGroup = {
  slug: string;
  name: string;
  description: string;
  integration?: { service: string } | null;
};

/** Slug, display name, description and the API integration's service. */
export function filterToolGroups<T extends SearchableGroup>(
  groups: readonly T[],
  query: string,
): T[] {
  if (!query.trim()) return [...groups];
  return groups.filter((g) =>
    matchesQuery([g.slug, g.name, g.description, g.integration?.service], query),
  );
}
