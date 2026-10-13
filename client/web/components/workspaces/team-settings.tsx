'use client';

import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { workspaceErrorText } from '@/lib/workspaces';
import { PrivateReadsToggle } from './private-reads-toggle';
import { useTeamSettings } from './team-settings-query';
import { WorkspaceSection } from './workspace-section';

/**
 * The member settings (W5c: Team admin is gone, its settings live on the
 * workspace screens): the read posture, a brain-wide switch, at the end of
 * the Admin workspace's screen, for an Admin user with the settings area
 * (the caller decides, showsMemberSettings). It sat on the built-in Team
 * workspace's screen, with a Member chat line, until brain migration 0286
 * made Team a normal workspace: each workspace's screen names its own
 * assistant. Data: GET /api/team-admin/settings.
 */
export function TeamSettingsSections() {
  const q = useTeamSettings();
  const data = q.data;
  if (!data) {
    return (
      <WorkspaceSection title="Member settings" labelledBy="workspace-team-settings">
        {q.isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {workspaceErrorText(q.error, 'Could not load the member settings.')}
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}
      </WorkspaceSection>
    );
  }
  return (
    <WorkspaceSection
      title="Read posture"
      labelledBy="workspace-read-posture"
      description="Members always get the brain's knowledge reads. This gates your private email and journal when the assistant of another workspace answers a member. Default off."
    >
      <PrivateReadsToggle initial={data.privateReads} />
    </WorkspaceSection>
  );
}
