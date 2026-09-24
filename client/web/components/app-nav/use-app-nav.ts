'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import type { AppNav, AppNavEntry, AppNavResponse, AppTint } from '@mantle/web-ui/types/app-nav';
import { useRealtime } from '@/components/realtime/use-realtime';

/**
 * The sidebar's app tree: one query (GET /api/app-nav) and the edits on it.
 *
 * ── Why edits are OPS, not snapshots ───────────────────────────────────────
 * The layout is brain-level and saved compare-and-set on a rev. A drag must
 * feel instant, so every edit applies optimistically to the cache and is
 * persisted behind it. Edits are kept as functions of the tree (`LayoutOp`)
 * until the server confirms them, because when another device saved first
 * (409) the right answer is to REPLAY our pending edits onto its tree, not to
 * throw them away or to overwrite its work with our stale snapshot.
 *
 * Saves run one at a time (the queue below) and each sends the LATEST cached
 * tree, so a burst of drags coalesces into as few writes as the network
 * allows, and no save ever goes out on a rev the previous one already spent.
 */
export const APP_NAV_KEY = ['app-nav'] as const;

/** An edit to the tree: the new entries, or null when it no longer applies. */
export type LayoutOp = (entries: AppNavEntry[]) => AppNavEntry[] | null;

// Module-level, like the realtime stream: every mounted consumer (sidebar,
// apps page) edits the same cached tree, so they must share one queue.
let pending: LayoutOp[] = [];
let queue: Promise<void> = Promise.resolve();

function replay(entries: AppNavEntry[], ops: LayoutOp[]): AppNavEntry[] {
  return ops.reduce((acc, op) => op(acc) ?? acc, entries);
}

function setNav(qc: QueryClient, nav: AppNav) {
  qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) => (d ? { ...d, nav } : d));
}

async function persist(qc: QueryClient, onConflictLost: () => void): Promise<void> {
  const data = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
  if (!data || pending.length === 0) return;
  const sent = pending.length;
  try {
    const res = await apiSend<{ nav: AppNav }>('/api/app-nav', 'PUT', {
      baseRev: data.nav.rev,
      entries: data.nav.entries,
    });
    pending = pending.slice(sent);
    // Adopt the new rev; keep entries carrying any edit made while we waited.
    const now = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
    setNav(qc, {
      rev: res.nav.rev,
      entries: pending.length ? (now?.nav.entries ?? res.nav.entries) : res.nav.entries,
    });
  } catch (err) {
    const theirs = err instanceof ApiError && err.status === 409 ? (err.body?.nav as AppNav) : null;
    if (theirs && Array.isArray(theirs.entries)) {
      // Someone else saved first: our edits go on top of theirs, then retry.
      setNav(qc, { rev: theirs.rev, entries: replay(theirs.entries, pending) });
      try {
        const again = qc.getQueryData<AppNavResponse>(APP_NAV_KEY)!;
        const resent = pending.length;
        const res = await apiSend<{ nav: AppNav }>('/api/app-nav', 'PUT', {
          baseRev: again.nav.rev,
          entries: again.nav.entries,
        });
        // Edits made during the retry stay pending; their own queued save
        // sends them on the new rev.
        pending = pending.slice(resent);
        const now = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
        setNav(qc, {
          rev: res.nav.rev,
          entries: pending.length ? (now?.nav.entries ?? res.nav.entries) : res.nav.entries,
        });
        return;
      } catch {
        /* fall through: a second conflict in a row, give up and resync */
      }
      onConflictLost();
    }
    pending = [];
    await qc.invalidateQueries({ queryKey: APP_NAV_KEY });
    if (!theirs) throw err;
  }
}

export function useAppNav() {
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: APP_NAV_KEY,
    queryFn: () => apiFetch<AppNavResponse>('/api/app-nav'),
    // A 404 is a brain on a release before app nav: the sidebar falls back to
    // the plain Apps row. Don't hammer it with retries.
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    staleTime: 30_000,
  });
  const unsupported = query.error instanceof ApiError && query.error.status === 404;

  // Another device (or an agent building an app) changed the tree. While our
  // own edits are still in flight, the save that settles them resyncs anyway;
  // refetching now would briefly show the tree without them.
  useRealtime(['app-nav'], () => {
    if (pending.length === 0) void qc.invalidateQueries({ queryKey: APP_NAV_KEY });
  });

  /** Apply one edit now and persist it behind the scenes. False (and no
   *  change) when the edit doesn't apply, e.g. a move past the depth limit. */
  const editLayout = useCallback(
    (op: LayoutOp): boolean => {
      const data = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
      if (!data) return false;
      const next = op(data.nav.entries);
      if (!next) return false;
      pending.push(op);
      setNav(qc, { rev: data.nav.rev, entries: next });
      queue = queue
        .then(() =>
          persist(qc, () =>
            toast.error('The app menu changed on another device at the same moment. Reloaded it.'),
          ),
        )
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Could not save the app menu');
        });
      return true;
    },
    [qc, toast],
  );

  const setPins = useCallback(
    async (pins: string[]) => {
      const prev = qc.getQueryData<AppNavResponse>(APP_NAV_KEY)?.pins;
      qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) => (d ? { ...d, pins } : d));
      try {
        const res = await apiSend<{ pins: string[] }>('/api/app-nav/pins', 'PUT', { pins });
        qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) => (d ? { ...d, pins: res.pins } : d));
      } catch (err) {
        qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) => (d && prev ? { ...d, pins: prev } : d));
        toast.error(err instanceof Error ? err.message : 'Could not save your pins');
      }
    },
    [qc, toast],
  );

  const togglePin = useCallback(
    (appId: string) => {
      const pins = qc.getQueryData<AppNavResponse>(APP_NAV_KEY)?.pins ?? [];
      void setPins(pins.includes(appId) ? pins.filter((p) => p !== appId) : [...pins, appId]);
    },
    [qc, setPins],
  );

  /** Change an app's icon and/or colour. Optimistic here and on the apps
   *  page; the PATCH notifies every other client. */
  const setAppLook = useCallback(
    async (appId: string, patch: { icon?: string; color?: AppTint | null }) => {
      const prev = qc.getQueryData<AppNavResponse>(APP_NAV_KEY);
      qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) =>
        d
          ? {
              ...d,
              apps: d.apps.map((a) =>
                a.id === appId
                  ? {
                      ...a,
                      ...(patch.icon !== undefined ? { icon: patch.icon || null } : {}),
                      ...(patch.color !== undefined ? { color: patch.color } : {}),
                    }
                  : a,
              ),
            }
          : d,
      );
      try {
        await apiSend(`/api/apps/${appId}`, 'PATCH', patch);
        // Refresh the /apps LIST pages (['apps', {query, sort, page}]) only.
        // Never the single-app query (['apps', id]): the editor re-syncs its
        // source tree from it, and a cosmetic write must not drop unsaved edits.
        void qc.invalidateQueries({
          predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'object',
        });
      } catch (err) {
        if (prev) qc.setQueryData(APP_NAV_KEY, prev);
        toast.error(err instanceof Error ? err.message : 'Could not save the app’s look');
      }
    },
    [qc, toast],
  );

  return { query, data: query.data, unsupported, editLayout, setPins, togglePin, setAppLook };
}

/**
 * Count an open of an app for "Most used" / "Recent". Fire-and-forget: it
 * must never delay or fail the open itself. Bumps the cached counter so the
 * filters reflect it without a refetch.
 */
export function recordAppOpen(qc: QueryClient, appId: string): void {
  qc.setQueryData<AppNavResponse>(APP_NAV_KEY, (d) => {
    if (!d) return d;
    const cur = d.opens[appId];
    return {
      ...d,
      opens: { ...d.opens, [appId]: { n: (cur?.n ?? 0) + 1, at: new Date().toISOString() } },
    };
  });
  void apiSend(`/api/apps/${appId}/opened`, 'POST').catch(() => {
    /* a brain before app nav has no counter; nothing to do */
  });
}
