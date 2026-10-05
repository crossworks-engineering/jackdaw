'use client';

import { useState } from 'react';
import { Ellipsis, History, MessageSquarePlus, Minus } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import type { AssistantAgentOption } from '@mantle/client-types';
import { AssistantDockToggle } from '@/components/assistant/assistant-dock';
import { AgentSelect } from './agent-select';
import { NEW_CHAT_LABEL, PREVIOUS_CHATS_LABEL } from './chat-threads-state';

/**
 * The assistant header's "..." menu (Jason, 2026-10-05: "going for
 * cleanness"). The header keeps two icons, New chat and this one; everything
 * else lives here, one row each, icon plus text:
 *
 *   1. the agent picker
 *   2. the panel shape: Side | Window | Full (wide screens only, as before)
 *   3. Previous chats | New chat
 *   4. Minimise (Esc)
 */
export function AssistantHeaderMenu({
  agents,
  selected,
  threads,
  showingPrevious,
  newChatDisabled,
  onPreviousChats,
  onNewChat,
  onMinimise,
}: {
  agents: AssistantAgentOption[];
  selected: string;
  /** False on a brain older than New chat: row 3 is left out. */
  threads: boolean;
  showingPrevious: boolean;
  newChatDisabled: boolean;
  onPreviousChats: () => void;
  onNewChat: () => void;
  onMinimise: () => void;
}) {
  const [open, setOpen] = useState(false);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={open ? 'secondary' : 'ghost'}
          size="icon-xs"
          title="More"
          aria-label="More chat options"
        >
          <Ellipsis aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 p-2">
        {agents.length > 0 && (
          <AgentSelect agents={agents} selected={selected} className="w-full" />
        )}
        <div className="hidden lg:block">
          <AssistantDockToggle labels />
        </div>
        {threads && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={showingPrevious ? 'secondary' : 'outline'}
              size="sm"
              onClick={act(onPreviousChats)}
              aria-pressed={showingPrevious}
            >
              <History aria-hidden />
              {PREVIOUS_CHATS_LABEL}
            </Button>
            <Button variant="outline" size="sm" disabled={newChatDisabled} onClick={act(onNewChat)}>
              <MessageSquarePlus aria-hidden />
              {NEW_CHAT_LABEL}
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={act(onMinimise)}
          aria-label="Minimise assistant"
        >
          <Minus aria-hidden />
          Minimise (Esc)
        </Button>
      </PopoverContent>
    </Popover>
  );
}
