'use client';

/**
 * Curated-pool quick pick — surfaces the /models/pools shortlists inside the
 * model pickers (the agents Models tab and the AI-workers form). Read-only
 * convenience: choosing an entry hands the caller a concrete
 * {provider, model} route and the caller stages it through its own state —
 * nothing is written here, and adopting still goes through the surface's own
 * apply/save flow.
 *
 * Renders nothing when the brain has no /api/model-pools (pre-v0.232.42) or
 * the pool is empty, so both host forms degrade to exactly what they were.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';

export type CuratedRoute = { provider: string; model: string };

export type CuratedEntry = {
  pool: string;
  position: number;
  name: string;
  vendor: string | null;
  routes: CuratedRoute[];
  pricing: { inputPerM: number | null; outputPerM: number | null } | null;
  rating: number | null;
  note: string | null;
};

type Bundle = { entries: CuratedEntry[] };

function priceLabel(p: CuratedEntry['pricing']): string {
  if (!p || (p.inputPerM == null && p.outputPerM == null)) return '';
  if (p.inputPerM === 0 && p.outputPerM === 0) return ' · Free';
  const f = (v: number | null) => (v == null ? '?' : `$${v}`);
  return ` · ${f(p.inputPerM)}/${f(p.outputPerM)} per M`;
}

/** The route to stage for an entry, honouring the caller's provider
 *  preference order; falls back to the entry's first route. */
function resolveRoute(entry: CuratedEntry, preferProviders?: string[]): CuratedRoute | null {
  if (preferProviders) {
    for (const p of preferProviders) {
      const r = entry.routes.find((x) => x.provider === p);
      if (r) return r;
    }
  }
  return entry.routes[0] ?? null;
}

export function CuratedPoolSelect({
  pool,
  preferProviders,
  strict,
  onPick,
}: {
  /** Pool id: 'agents' or a worker kind. */
  pool: string;
  /** Provider preference order for choosing which of the entry's routes to
   *  hand back (e.g. the currently selected provider first). */
  preferProviders?: string[];
  /** When true, entries with no route in `preferProviders` are hidden
   *  entirely (the host form can't switch provider on pick). */
  strict?: boolean;
  onPick: (route: CuratedRoute, entry: CuratedEntry) => void;
}) {
  const q = useQuery({
    queryKey: ['model-pools'],
    queryFn: () => apiFetch<Bundle>('/api/model-pools'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Radix wants a value; we treat this as a one-shot action menu, so the
  // selection is cleared right after it fires.
  const [value, setValue] = useState('');

  const entries = (q.data?.entries ?? [])
    .filter((e) => e.pool === pool)
    .filter((e) => !strict || !preferProviders || resolveRouteStrict(e, preferProviders))
    .sort((a, b) => a.position - b.position);
  if (entries.length === 0) return null;

  function resolveRouteStrict(e: CuratedEntry, prefer: string[]): CuratedRoute | null {
    for (const p of prefer) {
      const r = e.routes.find((x) => x.provider === p);
      if (r) return r;
    }
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        onValueChange={(name) => {
          const entry = entries.find((e) => e.name === name);
          const route = entry
            ? strict && preferProviders
              ? resolveRouteStrict(entry, preferProviders)
              : resolveRoute(entry, preferProviders)
            : null;
          if (entry && route) onPick(route, entry);
          setValue('');
        }}
      >
        <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Curated picks">
          <SelectValue placeholder={`Curated picks (${entries.length}) — quick select…`} />
        </SelectTrigger>
        <SelectContent>
          {entries.map((e) => (
            <SelectItem key={e.name} value={e.name}>
              {e.name}
              {e.rating ? ` ${'★'.repeat(e.rating)}` : ''}
              {priceLabel(e.pricing)}
              {e.note ? ` — ${e.note.length > 60 ? `${e.note.slice(0, 57)}…` : e.note}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        href={`/models/pools?pool=${pool}`}
        className="shrink-0 text-xs text-muted-foreground underline"
      >
        edit pool
      </Link>
    </div>
  );
}
