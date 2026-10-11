import type { NeedsYou } from '@mantle/client-types';

/**
 * Removed in W5c: GET /api/team-admin/needs-you is 410 on a W5c brain, so
 * nothing asks it. This stub answers null (nothing waits) ONLY for
 * app/(app)/team-admin/page.tsx, which falls back to its own request count;
 * a later W5c part removes Team admin, then delete this file.
 */
export function useNeedsYou(): NeedsYou | null {
  return null;
}
