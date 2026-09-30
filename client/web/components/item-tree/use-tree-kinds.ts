'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { isTreeKind, type TreeKind } from '@mantle/web-ui/types/tree';

/**
 * Whether this brain serves `kind` as the item tree: its /api/shell names the
 * kinds in `treeKinds`. A brain before the tree sends no `treeKinds`, and the
 * screen keeps its older list.
 *
 * Reads the shell the app frame already fetched (the admin frame renders only
 * once /api/shell has answered); never fetches it again from here. Undefined
 * while that is not known, which a screen treats as "not the tree".
 */
export function useTreeServes(kind: TreeKind): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['shell'],
    queryFn: () => apiFetch<{ treeKinds?: unknown }>('/api/shell'),
    enabled: false,
    select: (d: { treeKinds?: unknown }) => treeKindsOf(d),
  });
  return data === undefined ? undefined : data.includes(kind);
}

/** The kinds a shell payload names, ignoring anything this client does not
 *  know; [] for a brain that sends none. */
export function treeKindsOf(shell: { treeKinds?: unknown } | null | undefined): TreeKind[] {
  const raw = shell?.treeKinds;
  return Array.isArray(raw) ? raw.filter(isTreeKind) : [];
}
