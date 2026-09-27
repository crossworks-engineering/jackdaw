'use client';

import { MessageSquare } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { useAssistantDock } from '@/components/assistant/assistant-dock';

/**
 * A member's chat launcher in the rail toolbar (member logins, Phase 3): opens
 * and minimises the assistant dock, like the admin's Assistant button, without
 * its admin parts (pending-question badge, run spinner). ⌘I toggles it too.
 */
export function MemberChatButton() {
  const { panel, toggle } = useAssistantDock();
  const open = panel === 'open';
  return (
    <Button
      onClick={toggle}
      size="sm"
      variant={open ? 'default' : 'ghost'}
      className={cn('relative min-w-0 group-data-[nav-collapsed=true]/shell:px-2')}
      aria-pressed={open}
      aria-label="Toggle chat (⌘I)"
      title="Chat (⌘I)"
    >
      <MessageSquare aria-hidden />
      <span className="truncate group-data-[nav-collapsed=true]/shell:hidden">Chat</span>
    </Button>
  );
}
