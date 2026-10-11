'use client';

import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { workspaceErrorText } from '@/lib/workspaces';
import { HubAppPicker } from './hub-app-picker';
import { PrivateReadsToggle } from './private-reads-toggle';
import { MemberChatAccess } from './team-agent-access';
import { useTeamSettings } from './team-settings-query';
import { WorkspaceSection } from './workspace-section';

/**
 * The Team settings (W5c: Team admin is gone, its settings live here): three
 * sections at the end of the built-in Team workspace's screen, for an Admin
 * user only (the caller decides). Member chat sets the team agent's level,
 * Read posture gates the owner's email and journal, and Member home app
 * picks the app a member sees as home. Data: GET /api/team-admin/settings.
 */
export function TeamSettingsSections() {
  const q = useTeamSettings();
  const data = q.data;
  if (!data) {
    return (
      <WorkspaceSection title="Team settings" labelledBy="workspace-team-settings">
        {q.isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {workspaceErrorText(q.error, 'Could not load the Team settings.')}
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
    <>
      <WorkspaceSection
        title="Member chat"
        labelledBy="workspace-member-chat"
        description="Members chat with the team agent. It must be at Team level first."
      >
        <MemberChatAccess agent={data.teamAgent} />
      </WorkspaceSection>
      <WorkspaceSection
        title="Read posture"
        labelledBy="workspace-read-posture"
        description="Members always get the brain's knowledge reads. This gates your private email and journal when the team agent answers a member. Default off."
      >
        <PrivateReadsToggle initial={data.privateReads} />
      </WorkspaceSection>
      <WorkspaceSection
        title="Member home app"
        labelledBy="workspace-home-app"
        description="Which published app a member login sees as their home. The built-in member home is the fallback."
      >
        {/* Keyed by the current choice so a change made elsewhere (another
            tab, MCP) resyncs the picker on refetch. */}
        <HubAppPicker
          key={data.hubAppId ?? 'builtin'}
          currentAppId={data.hubAppId}
          apps={data.hubCandidates}
        />
      </WorkspaceSection>
    </>
  );
}
