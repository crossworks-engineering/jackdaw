'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { isTreeKind, TREE_KIND_SPECS, TREE_KINDS, type TreeKind } from '@mantle/web-ui/types/tree';

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

/** The kinds a member's or client's shell browses as a read-only tree
 * (`treeKinds` on /api/member/shell or /api/client/shell). Reads the shell
 * the app frame already fetched, like `useTreeServes`; [] for a brain before
 * folder sharing (the screen keeps its list), undefined until it is known. */
export function useReaderTreeKinds(source: 'member' | 'client'): TreeKind[] | undefined {
  const url = source === 'member' ? '/api/member/shell' : '/api/client/shell';
  const { data } = useQuery({
    queryKey: [source === 'member' ? 'member-shell' : 'client-shell'],
    queryFn: () => apiFetch<{ treeKinds?: unknown }>(url),
    enabled: false,
    select: (d: { treeKinds?: unknown }) => treeKindsOf(d),
  });
  // Not known while the server renders and the page hydrates: the server has
  // no shell, and a screen that chose the tree from the browser's cached one
  // would not match what the server drew.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return hydrated ? data : undefined;
}

const noSubscribe = () => () => {};

/** Whether that shell names `kind`. */
export function useReaderTreeServes(
  source: 'member' | 'client',
  kind: TreeKind | null,
): boolean | undefined {
  const kinds = useReaderTreeKinds(source);
  return kinds === undefined ? undefined : kind !== null && kinds.includes(kind);
}

/** The tree kind whose items are of this node type (a Library kind: note,
 *  file, draw, table), or null. */
export function treeKindOfItem(nodeType: string): TreeKind | null {
  return TREE_KINDS.find((k) => TREE_KIND_SPECS[k].nodeType === nodeType) ?? null;
}
