'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useQueryClient, type InfiniteData, type Query } from '@tanstack/react-query';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { TreeFolder, TreeFolderPage, TreeKind } from '@mantle/web-ui/types/tree';
import { treeScope, type TreeSource } from './tree-api';
import { liveFolder, type CachedFolderPages } from './tree-model';

/**
 * Hooks that read what a kind's tree has cached (its folder pages, under
 * `['tree', scope, 'folder', id, sort]`), for a screen beside the tree: the
 * member's New and Upload target.
 */

function isFolderQuery(q: Query, scope: string): boolean {
  const key = q.queryKey;
  return key[0] === 'tree' && key[1] === scope && key[2] === 'folder';
}

function cachedOf(q: Query): CachedFolderPages {
  const id = q.queryKey[3];
  const data = q.state.data as InfiniteData<TreeFolderPage> | undefined;
  const err = q.state.error;
  return {
    folderId: id === 'root' || typeof id !== 'string' ? null : id,
    ok: q.state.status === 'success',
    notFound: err instanceof ApiError && err.status === 404,
    pages: data?.pages,
  };
}

/**
 * The folder as the tree's cache holds it now, or null once it has left the
 * tree (deleted, or moved where the cache shows it is not). Null in, null
 * out.
 */
export function useLiveTreeFolder(
  kind: TreeKind | null,
  source: TreeSource,
  folder: TreeFolder | null,
): TreeFolder | null {
  const qc = useQueryClient();
  const scope = kind ? treeScope(kind, source) : null;
  const version = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) =>
      qc.getQueryCache().subscribe((e) => {
        if (!scope || !isFolderQuery(e.query, scope)) return;
        if (e.type !== 'updated' && e.type !== 'removed') return;
        version.current += 1;
        queueMicrotask(onChange);
      }),
    [qc, scope],
  );
  useSyncExternalStore(
    subscribe,
    () => version.current,
    () => 0,
  );
  if (!folder || !scope) return folder;
  const cache = qc
    .getQueryCache()
    .findAll({ queryKey: ['tree', scope, 'folder'] })
    .map(cachedOf);
  return liveFolder(cache, folder);
}
