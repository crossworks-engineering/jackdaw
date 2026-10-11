/**
 * Who members chat with, as the Team workspace's Member chat section shows
 * it (Team settings). Since W5c the Team workspace's assistant is the one
 * members chat with: there is no agent level to set. The brain reports it on
 * GET /api/team-admin/settings (`teamAssistant`, brain b017d1874); null when
 * the Team workspace has no assistant. Pure: pinned by team-assistant.test.ts.
 */

/** `teamAssistant` on GET /api/team-admin/settings. */
export type TeamAssistant = { slug: string; name: string; workspaceId: string };

/** What the section says when the Team workspace has no assistant. */
export const NO_TEAM_ASSISTANT_TEXT =
  'No assistant. Members cannot chat until this workspace has one.';

/** Where the assistant opens, for a login that manages assistants. */
export function teamAssistantHref(slug: string): string {
  return `/settings/agents?selected=${encodeURIComponent(slug)}`;
}
