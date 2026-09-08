'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import type { ExplorerModel } from '@mantle/client-types';

/**
 * The live model catalog for one provider.
 *
 * The agents form needs this twice — once for the primary route and once for
 * the backup — and it was written out twice, thirty lines each, the second
 * carrying the comment "same shape as the primary above". Same shape written
 * twice is the same bug written twice, so it is one hook now.
 *
 * The catalog matters more than a dropdown usually does: before it was live,
 * the provider list was hard-coded to openrouter and operators ended up saving
 * cross-provider slugs that 404'd at the first turn
 * (`anthropic/claude-haiku-4.5` against direct Anthropic, which wants
 * `claude-haiku-4-5`).
 */

export type ModelCatalog = {
  models: ExplorerModel[];
  loading: boolean;
  /** A catalog can arrive AND carry an error — a provider that answered
   *  partially still lists what it has, and the note says why the rest is
   *  missing. So this is not the inverse of `models.length`. */
  error: string | null;
};

export const EMPTY_CATALOG: ModelCatalog = { models: [], loading: true, error: null };

/** Every provider slug falls back to openrouter, which is the one that always
 *  answers and the one the form defaults to. */
export function resolveProvider(provider: string | undefined | null): string {
  return provider || 'openrouter';
}

export function catalogUrl(provider: string | undefined | null): string {
  return `/api/models?provider=${encodeURIComponent(resolveProvider(provider))}`;
}

/** Fold the endpoint's answer into catalog state. Pure, and the whole of what
 *  can be wrong here. */
export function catalogFromResponse(d: { models?: ExplorerModel[]; error?: string }): ModelCatalog {
  if (d?.models && Array.isArray(d.models)) {
    return { models: d.models, loading: false, error: d.error ?? null };
  }
  return { models: [], loading: false, error: d?.error ?? 'No catalog returned' };
}

export function catalogFromError(err: unknown): ModelCatalog {
  return {
    models: [],
    loading: false,
    error: err instanceof Error ? err.message : 'Catalog fetch failed',
  };
}

/**
 * @param enabled false leaves the catalog exactly as it was and fetches
 *   nothing — the backup route is only asked for while its section is open, so
 *   an agent with no backup costs no /api/models call. Deliberately NOT a reset
 *   to empty: that is the behaviour this replaces, and changing it here would
 *   be a behaviour change hiding inside a refactor.
 */
export function useModelCatalog(provider: string | undefined | null, enabled = true): ModelCatalog {
  const [catalog, setCatalog] = useState<ModelCatalog>(EMPTY_CATALOG);
  const resolved = resolveProvider(provider);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Show loading immediately, so swapping provider shows a spinner rather
    // than the previous provider's models while the new list is in flight.
    setCatalog({ models: [], loading: true, error: null });
    apiFetch<{ models?: ExplorerModel[]; error?: string }>(catalogUrl(resolved))
      .then((d) => {
        if (!cancelled) setCatalog(catalogFromResponse(d));
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalog(catalogFromError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [resolved, enabled]);

  return catalog;
}
