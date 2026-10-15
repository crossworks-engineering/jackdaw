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

/**
 * The catalog for `provider`, listed with the picked key when there is one.
 * The key decides the list: a key saved under any label but `default` used to
 * list nothing, because the brain looked up the `default` label only. A brain
 * from before `keyId` ignores it and lists with its own pick, as before.
 */
export function catalogUrl(provider: string | undefined | null, keyId?: string | null): string {
  const base = `/api/models?provider=${encodeURIComponent(resolveProvider(provider))}`;
  return keyId ? `${base}&keyId=${encodeURIComponent(keyId)}` : base;
}

/**
 * The picked key's id when it belongs to `provider`, else null. The form keeps
 * the key while the provider changes, and the brain refuses a key of another
 * service (400), so only a coherent pair is sent.
 */
export function catalogKeyId(
  keys: readonly { id: string; service: string }[],
  keyId: string | undefined | null,
  provider: string | undefined | null,
): string | null {
  if (!keyId) return null;
  const k = keys.find((x) => x.id === keyId);
  return k && k.service === resolveProvider(provider) ? k.id : null;
}

/**
 * The query key of a catalog: one per provider AND picked key, so a new pick
 * fetches its own list (two keys of one provider can list different models).
 * The /models page's refresh invalidates the `['models']` prefix, which
 * covers every key.
 */
export function catalogQueryKey(
  provider: string | undefined | null,
  keyId: string | null,
): readonly ['models', string, string | null] {
  return ['models', resolveProvider(provider), keyId];
}

/** What the list says when the brain finds no key it can use for the
 *  provider: none saved, or (an older brain that ignores the picked key) none
 *  labelled 'default'. Says "usable", so it is true in both cases. */
export const NEEDS_KEY_MESSAGE =
  'No usable API key for this provider. Add one at /settings/keys (an older brain uses only a key labelled "default"), then pick it above.';
/** What the list says for a provider with no model list API. */
export const UNSUPPORTED_MESSAGE =
  'This provider publishes no model list. Type the model id it documents.';

export type CatalogResponse = {
  models?: ExplorerModel[];
  error?: string;
  needsKey?: boolean;
  unsupported?: boolean;
};

/** Fold the endpoint's answer into catalog state. Pure, and the whole of what
 *  can be wrong here. An empty list always says why (no key, no list API, the
 *  provider refused the key), never a silent empty picker. */
export function catalogFromResponse(d: CatalogResponse): ModelCatalog {
  if (d?.models && Array.isArray(d.models)) {
    const why =
      d.error ??
      (d.models.length === 0 && d.needsKey
        ? NEEDS_KEY_MESSAGE
        : d.models.length === 0 && d.unsupported
          ? UNSUPPORTED_MESSAGE
          : null);
    return { models: d.models, loading: false, error: why };
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
 * @param keyId the picked key (catalogKeyId); a new pick fetches again.
 */
export function useModelCatalog(
  provider: string | undefined | null,
  enabled = true,
  keyId: string | null = null,
): ModelCatalog {
  const [catalog, setCatalog] = useState<ModelCatalog>(EMPTY_CATALOG);
  const resolved = resolveProvider(provider);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Show loading immediately, so swapping provider shows a spinner rather
    // than the previous provider's models while the new list is in flight.
    setCatalog({ models: [], loading: true, error: null });
    apiFetch<CatalogResponse>(catalogUrl(resolved, keyId))
      .then((d) => {
        if (!cancelled) setCatalog(catalogFromResponse(d));
      })
      .catch((err: unknown) => {
        if (!cancelled) setCatalog(catalogFromError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [resolved, enabled, keyId]);

  return catalog;
}
