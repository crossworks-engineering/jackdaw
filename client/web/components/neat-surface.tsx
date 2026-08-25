'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { NeatBackdrop } from '@mantle/web-ui/neat-backdrop';
import { decodeNeatSpec } from '@mantle/share-ui/neat-background';

/**
 * The brain's SAVED Neat background on a real surface (the shell's content
 * area, the team workspace; the login screen passes its server-loaded spec to
 * NeatBackdrop directly). Renders nothing when no background is saved — the
 * plain themed fill is the default, not an empty gradient.
 *
 * Reads the public /api/appearance under the same ['appearance'] query key the
 * Appearance generator card patches on save, so saving or removing a
 * background repaints the shell immediately, no reload and no invalidation
 * race against the route's 30s public cache.
 *
 * `shared` marks the surface as one the owner shares OUT (the team workspace;
 * the /s reader applies the same flag server-side): those additionally honour
 * the `shareNeat` switch, so an owner can keep the app decorated while shared
 * surfaces stay on the plain, printable fill.
 */
export function NeatSurface({
  className,
  shared = false,
}: {
  className?: string;
  shared?: boolean;
}) {
  const appearance = useQuery({
    queryKey: ['appearance'],
    queryFn: () =>
      apiFetch<{ neatBackground?: string | null; shareNeat?: boolean }>('/api/appearance'),
  });
  if (shared && appearance.data?.shareNeat === false) return null;
  const spec = appearance.data ? decodeNeatSpec(appearance.data.neatBackground) : null;
  if (!spec) return null;
  return <NeatBackdrop spec={spec} className={className} resolution={0.75} />;
}
