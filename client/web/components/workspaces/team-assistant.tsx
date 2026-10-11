'use client';

import Link from 'next/link';
import { hasArea } from '@/lib/workspaces';
import {
  NO_TEAM_ASSISTANT_TEXT,
  teamAssistantHref,
  type TeamAssistant,
} from '@/lib/team-assistant';
import { useViewerAreas } from './use-shell-workspaces';

/**
 * The Team workspace's Member chat section (Team settings, shown to an Admin
 * user): who members chat with, the Team workspace's assistant. Nothing to
 * set here since W5c: the assistant is a resource of this workspace. A link
 * for a login that manages assistants, else its name. The section frame is
 * the caller's (WorkspaceSection).
 */
export function TeamAssistantLine({ assistant }: { assistant: TeamAssistant | null | undefined }) {
  const areas = useViewerAreas();
  if (!assistant) {
    return <p className="text-sm text-muted-foreground">{NO_TEAM_ASSISTANT_TEXT}</p>;
  }
  return (
    <p className="text-sm">
      Members chat with{' '}
      {hasArea(areas, 'assistants') ? (
        <Link
          href={teamAssistantHref(assistant.slug)}
          className="font-medium underline underline-offset-4 hover:text-primary-ink"
        >
          {assistant.name}
        </Link>
      ) : (
        <span className="font-medium">{assistant.name}</span>
      )}
      .
    </p>
  );
}
