'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import {
  WORKSPACES_KEY,
  nextUserSearchOffset,
  userSearchReady,
  workspaceKey,
  type ArchivePreview,
  type UserSearchHit,
  type Workspace,
  type WorkspaceDetail,
} from '@/lib/workspaces';

const base = '/api/workspaces';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;

/** GET /api/workspaces: the workspaces the login is in (Admin users: all). */
export function useWorkspaces() {
  return useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: () => apiFetch<{ workspaces: Workspace[] }>(base).then((r) => r.workspaces),
  });
}

/** GET /api/workspaces/:id: users, resources and whether the assistant has
 *  history. */
export function useWorkspaceDetail(id: string | null) {
  return useQuery({
    queryKey: workspaceKey(id ?? ''),
    queryFn: () => apiFetch<WorkspaceDetail>(one(id!)),
    enabled: !!id,
  });
}

/**
 * GET /api/workspaces/user-search?q=&offset= (from `min` characters: three
 * for a Moderator; an Admin user may send none). An Admin user's answer
 * comes in pages of 50, fetched on `loadMore`; a Moderator's is one answer.
 */
export function useUserSearch(q: string, enabled: boolean, min: number, paged: boolean) {
  const term = q.trim();
  const query = useInfiniteQuery({
    queryKey: ['workspaces', 'user-search', term, paged],
    queryFn: ({ pageParam }) =>
      apiFetch<UserSearchHit[]>(
        `${base}/user-search?q=${encodeURIComponent(term)}${pageParam > 0 ? `&offset=${pageParam}` : ''}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (_last, pages) => nextUserSearchOffset(pages, paged),
    enabled: enabled && userSearchReady(term, min),
    staleTime: 30_000,
  });
  return {
    hits: query.data?.pages.flat(),
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}

export function fetchArchivePreview(id: string): Promise<ArchivePreview> {
  return apiFetch<ArchivePreview>(`${one(id)}/archive-preview`);
}

/** Every workspace call. Each one refreshes the list, the workspace, and the
 *  shell (the switcher names the workspaces). */
export function useWorkspaceActions() {
  const qc = useQueryClient();
  const refresh = (id?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: WORKSPACES_KEY, exact: true }),
      id ? qc.invalidateQueries({ queryKey: workspaceKey(id) }) : null,
      qc.invalidateQueries({ queryKey: ['shell'] }),
    ]);
  const after =
    <T>(id: string | undefined) =>
    async (p: Promise<T>): Promise<T> => {
      const out = await p;
      await refresh(id);
      return out;
    };
  return {
    create: (body: { name: string; description?: string }) =>
      after<Workspace>(undefined)(apiSend<Workspace>(base, 'POST', body)),
    update: (
      id: string,
      body: {
        name?: string;
        description?: string;
        contactNodeId?: string | null;
        assistantId?: string | null;
      },
    ) => after<unknown>(id)(apiSend(one(id), 'PATCH', body)),
    archive: (id: string) => after<unknown>(id)(apiSend(`${one(id)}/archive`, 'POST')),
    addUser: (id: string, loginId: string, moderator = false) =>
      after<unknown>(id)(apiSend(`${one(id)}/users`, 'POST', { loginId, moderator })),
    setModerator: (id: string, loginId: string, moderator: boolean) =>
      after<unknown>(id)(
        apiSend(`${one(id)}/users/${encodeURIComponent(loginId)}`, 'PATCH', { moderator }),
      ),
    removeUser: (id: string, loginId: string) =>
      after<unknown>(id)(apiSend(`${one(id)}/users/${encodeURIComponent(loginId)}`, 'DELETE')),
    addResource: (id: string, kind: string, refId: string, write = false) =>
      after<unknown>(id)(apiSend(`${one(id)}/resources`, 'POST', { kind, id: refId, write })),
    setResourceWrite: (id: string, kind: string, refId: string, write: boolean) =>
      after<unknown>(id)(
        apiSend(
          `${one(id)}/resources/${encodeURIComponent(kind)}/${encodeURIComponent(refId)}`,
          'PATCH',
          { write },
        ),
      ),
    removeResource: (id: string, kind: string, refId: string) =>
      after<unknown>(id)(
        apiSend(
          `${one(id)}/resources/${encodeURIComponent(kind)}/${encodeURIComponent(refId)}`,
          'DELETE',
        ),
      ),
  };
}
