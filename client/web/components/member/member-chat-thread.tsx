'use client';

import { useQuery } from '@tanstack/react-query';
import { Minus } from 'lucide-react';
import type { MemberChatThread as MemberChatThreadData } from '@mantle/client-types';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { AreaBackdrop } from '@mantle/web-ui/area-backdrop';
import { AvatarWithLevel } from '@mantle/web-ui/avatar-with-level';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { AssistantDockToggle, useAssistantDock } from '@/components/assistant/assistant-dock';
import { MEMBER_CHAT_KEY, MemberChat } from './member-chat';

/**
 * A member's chat inside the admin assistant dock (member logins, Phase 3):
 * the same panel, with its three shapes (side column, movable window, full
 * display) and minimise, around the member's own thread with the team-level
 * agent (/api/member/chat). The admin-only parts of the owner thread are not
 * here: no agent picker (members have one agent), no pinned-context strip,
 * pending questions, active runs or settings links.
 */
export function MemberChatThread() {
  const { minimize, display, startPopoutMove } = useAssistantDock();
  // The same query the chat body reads: one fetch, the header takes the name.
  const thread = useQuery({
    queryKey: MEMBER_CHAT_KEY,
    queryFn: () => apiFetch<MemberChatThreadData>('/api/member/chat'),
  });
  const agent = thread.data?.agent ?? null;

  return (
    <div className="relative isolate flex h-full flex-col">
      <AreaBackdrop area="chat" className="-z-10" />
      {/* In window mode the header is the title bar (drag to move). */}
      <header
        onPointerDown={startPopoutMove}
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-3',
          display === 'popout' && 'cursor-grab select-none active:cursor-grabbing',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {agent ? <AvatarWithLevel seed={agent.slug} size={40} /> : null}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight text-foreground">
              {agent ? agent.name : 'Chat'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your own chat. Other members do not see it.
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <AssistantDockToggle />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={minimize}
            title="Minimise (Esc)"
            aria-label="Minimise chat"
          >
            <Minus aria-hidden />
          </Button>
        </div>
      </header>
      <MemberChat />
    </div>
  );
}
