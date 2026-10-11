/**
 * Removed in W5c: "Needs you" (review, team requests and locked contacts
 * from GET /api/team-admin/needs-you) went with the review flow; a W5c
 * brain answers that route 410. Provider outages read their own route
 * (lib/provider-alerts.ts). What stays here serves ONLY
 * app/(app)/team-admin/page.tsx, which a later W5c part removes; delete
 * this file then.
 */
import type { NeedsYou } from '@mantle/client-types';

/** Open team requests in a "Needs you" answer (none is asked now). */
export const requestsOpen = (n: NeedsYou | null | undefined): number => (n ? n.requests.open : 0);
