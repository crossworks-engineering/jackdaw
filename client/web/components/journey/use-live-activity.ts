'use client';

import { useEffect, useState } from 'react';
import type { LiveActivity } from '@mantle/client-types/journey-format';
import { apiFetch } from '@mantle/web-ui/api-fetch';

/** How often the snapshot is refetched when the caller says nothing else. */
export const LIVE_ACTIVITY_POLL_MS = 5000;

/**
 * Polls /api/activity for the always-on live snapshot (active / recent /
 * failures). Pauses while the tab is hidden, refetches on focus, aborts the
 * in-flight request on each tick + unmount, and keeps the last-good snapshot
 * across network blips. `tick` increments every `tickMs` so callers can refresh
 * relative timestamps without a network round-trip.
 *
 * **Both cadences are the caller's to set, and both cost.** This hook is
 * mounted by the shell's live column, which means every signed-in route in the
 * app, and the column is COLLAPSED by default — where it shows three counts and
 * no timestamps at all. At the old fixed 5s that was a request every five
 * seconds on every route for a number that changes rarely, plus a re-render of
 * the column every five seconds to restate timestamps nobody could see. Pass
 * `tickMs: null` when no relative time is on screen.
 */
export function useLiveActivity(
  pollMs = LIVE_ACTIVITY_POLL_MS,
  tickMs: number | null = LIVE_ACTIVITY_POLL_MS,
): {
  data: LiveActivity | null;
  loaded: boolean;
  tick: number;
} {
  const [data, setData] = useState<LiveActivity | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let controller: AbortController | null = null;

    const fetchOnce = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      try {
        const json = await apiFetch<LiveActivity>('/api/activity', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (alive) setData(json);
      } catch {
        // network blip — keep last-good snapshot, retry next tick
      } finally {
        if (alive) setLoaded(true);
      }
    };

    void fetchOnce();
    const poll = setInterval(fetchOnce, pollMs);
    const ticker =
      tickMs === null ? null : setInterval(() => alive && setTick((n) => n + 1), tickMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchOnce();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      alive = false;
      clearInterval(poll);
      if (ticker !== null) clearInterval(ticker);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pollMs, tickMs]);

  return { data, loaded, tick };
}

/** "3s" / "5m" / "2h" / "1d" since an ISO timestamp. */
export function relativeTime(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Seconds since an ISO timestamp (for stall detection on running traces). */
export function ageSeconds(iso: string): number {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
}

/** A running trace older than this is probably orphaned (process died mid-run). */
export const STALL_THRESHOLD_S = 120;
