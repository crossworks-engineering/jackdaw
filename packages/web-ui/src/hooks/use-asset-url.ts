'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { assetTokenVersion, assetUrl, subscribeAssetToken } from '../asset-url';

/** The server pass holds no token and must return a stable snapshot. */
function serverVersion(): number {
  return 0;
}

/**
 * `assetUrl()`, but reactive.
 *
 * Use this instead of importing `assetUrl` directly in ANY component that
 * resolves a URL while rendering — `<img src>`, an `<iframe src>`, a download
 * `<a href>`. The plain function is a synchronous read of a token that arrives
 * from `GET /api/shell` a beat after the component first paints, so a direct
 * call renders an unsigned URL that 401s in a split deployment and is never
 * re-resolved. Subscribing re-renders the component when the token lands, and
 * again on each rotation — which matters for anchors most of all, since their
 * href is resolved at render and used whenever the owner gets round to
 * clicking.
 *
 * Same-origin (the normal deployment) there is no token: the returned resolver
 * hands back the path unchanged, this never re-renders, and the subscription
 * costs one `Set` entry.
 *
 * The returned function changes identity when the token does, so it is safe to
 * use as a `useMemo`/`useCallback` dependency — and must be listed as one, or a
 * memoised child keeps the stale URL.
 */
export function useAssetUrl(): (path: string) => string {
  const version = useSyncExternalStore(subscribeAssetToken, assetTokenVersion, serverVersion);
  // `version` is an IDENTITY dependency: the body cannot reference it, because
  // `assetUrl` reads the live token itself — but it is the whole mechanism,
  // since a resolver that kept its identity across a rotation would leave
  // every memoised consumer holding the url it was handed on first paint.
  // Returning a fresh closure per render instead would fix the staleness and
  // break the memoisation §17 just bought.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see above: keyed on the token generation, deliberately unread
  return useMemo(() => (path: string) => assetUrl(path), [version]);
}
