'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { NeatBackdrop } from '@mantle/web-ui/neat-backdrop';
import { decodeNeatSpec } from '@mantle/web-ui/neat-background';

/**
 * The brain's SAVED Neat background on a real surface (the shell's content
 * area; the login screen passes its server-loaded spec to NeatBackdrop
 * directly). Renders nothing when no background is saved — the plain themed
 * fill is the default, not an empty gradient.
 *
 * Reads the public /api/appearance under the same ['appearance'] query key the
 * Appearance generator card patches on save, so saving or removing a
 * background repaints the shell immediately, no reload and no invalidation
 * race against the route's 30s public cache.
 */
export function NeatSurface({ className }: { className?: string }) {
  const appearance = useQuery({
    queryKey: ['appearance'],
    queryFn: () => apiFetch<{ neatBackground?: string | null }>('/api/appearance'),
  });
  const spec = appearance.data ? decodeNeatSpec(appearance.data.neatBackground) : null;
  if (!spec) return null;
  return <NeatBackdrop spec={spec} className={className} resolution={0.75} />;
}
