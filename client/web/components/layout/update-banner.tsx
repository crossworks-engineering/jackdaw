'use client';

/**
 * "Update available" chip at the top of the sidebar menus. Renders NOTHING
 * unless the (server-cached) release check says a newer version exists —
 * up-to-date installs, dev, and offline boxes never see it. Clicking goes to
 * /settings/updates where the actual update runs.
 *
 * In the collapsed icon rail the label hides and the icon stands alone,
 * following the sidebar's group-data-[nav-collapsed]/shell pattern.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpCircle } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { APP_VERSION } from '@mantle/web-ui/version';

type CheckPayload = {
  updateAvailable?: boolean;
  latest?: { tag?: string } | null;
  /** The interface's own release stream (post-split servers). The server
   *  cannot know which client build this browser runs, so whether the
   *  INTERFACE is stale is decided here, against our own APP_VERSION. */
  client?: { latest?: { tag?: string } | null } | null;
};

/** Numeric segment-wise tag compare; >0 when a > b (v-prefix ignored). */
function tagNewer(tag: string, version: string): boolean {
  const norm = (v: string) =>
    v
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = norm(tag);
  const pb = norm(version);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Re-poll hourly so a long-open tab surfaces a new release within the hour. The
// server still gates the actual GitHub call (30min TTL once "no update"), so
// this only reads the cache; it doesn't add API traffic.
const RECHECK_MS = 60 * 60 * 1000;

export function UpdateBanner({ onNavigate }: { onNavigate?: () => void }) {
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const data = await apiFetch<CheckPayload>('/api/updates/check', { cache: 'no-store' });
        if (cancelled) return;
        // A server release wins the label; failing that, an interface-only
        // release lights the same chip (the updates page separates them).
        const clientTag = data.client?.latest?.tag;
        setTag(
          data.updateAvailable
            ? (data.latest?.tag ?? null)
            : clientTag && tagNewer(clientTag, APP_VERSION)
              ? `${clientTag} (interface)`
              : null,
        );
      } catch {
        // Offline / transient — just don't show the banner.
      }
    };
    void check();
    const t = setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!tag) return null;

  return (
    <div className="px-3 pt-3 group-data-[nav-collapsed=true]/shell:px-2">
      <Link
        href="/settings/updates"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/80 group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:px-0 group-data-[nav-collapsed=true]/shell:py-2"
        title={`Update available — ${tag}`}
      >
        <ArrowUpCircle className="size-4 shrink-0" />
        <span className="truncate group-data-[nav-collapsed=true]/shell:hidden">
          Update available · {tag}
        </span>
      </Link>
    </div>
  );
}
