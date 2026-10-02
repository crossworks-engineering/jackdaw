import { matchesQuery } from './tool-search';

/** Which rows of a tool group's membership list to show. */
export type MembershipScope = 'all' | 'in' | 'out';

type MemberTool = { slug: string; name: string; description: string; kind: string };

/**
 * The rows a tool group's editor shows: the query over slug, display name,
 * description and handler kind (the same word rule as the Tools search), then
 * the scope against the group's selection.
 *
 * It only HIDES rows. The selection is an input here, never an output, so a
 * ticked tool the filter hides stays in the group.
 */
export function filterMembership<T extends MemberTool>(
  tools: readonly T[],
  selected: readonly string[],
  query: string,
  scope: MembershipScope,
): T[] {
  const inGroup = new Set(selected);
  return tools.filter((t) => {
    if (scope === 'in' && !inGroup.has(t.slug)) return false;
    if (scope === 'out' && inGroup.has(t.slug)) return false;
    return matchesQuery([t.slug, t.name, t.description, t.kind], query);
  });
}
