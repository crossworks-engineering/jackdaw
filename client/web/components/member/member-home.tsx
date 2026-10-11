'use client';

import { MessageSquare } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { useAssistantDock } from '@/components/assistant/assistant-dock';
import { PlainHomeView } from '@/components/home/plain-home';
import { useShellWorkspaces } from '@/components/workspaces/use-shell-workspaces';

/**
 * A member's built-in home (W6b): its workspaces and the screens it works
 * in, as every login's plain home, with Ask the assistant. Its own work is
 * in its private workspace ("Only you" in the switcher) on the normal
 * screens; the old recent work and Library lists read the member space,
 * which is gone.
 */
export function MemberHome() {
  const { openAssistant } = useAssistantDock();
  const shell = useShellWorkspaces();
  return (
    <PlainHomeView
      workspaces={shell?.workspaces ?? []}
      actions={
        <Button variant="outline" size="sm" onClick={() => openAssistant()}>
          <MessageSquare /> Ask the assistant
        </Button>
      }
    />
  );
}
