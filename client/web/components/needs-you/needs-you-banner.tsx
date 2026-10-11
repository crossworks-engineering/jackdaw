/**
 * Removed in W5c: the "Needs you" notice counted review, team requests and
 * locked contacts from GET /api/team-admin/needs-you, which a W5c brain no
 * longer serves (410). Provider outages keep their own notice
 * (provider-alert-banner.tsx). This stub renders nothing; the shell helper
 * drops the import from components/app-shell.tsx, then delete this file.
 */
export function NeedsYouBanner(_props: { onNavigate?: () => void }): null {
  return null;
}
