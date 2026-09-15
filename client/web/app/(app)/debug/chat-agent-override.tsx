'use client';

import { useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';

/**
 * "No override" as a Select item value. Radix throws on an item whose value is
 * the empty string — it reserves `''` for "nothing is selected", which is how
 * it decides to show the placeholder — so the raw `<option value="">` this
 * replaced cannot be carried across literally. It maps back to `''` (and then
 * to a `null` on the wire) the moment it leaves the control.
 */
const NO_OVERRIDE = '__default__';

type AgentOption = {
  id: string;
  name: string;
  role: string;
  model: string;
  enabled: boolean;
};

export function ChatAgentOverride({
  chatId,
  current,
  agents,
}: {
  chatId: string;
  current: string | null;
  agents: AgentOption[];
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string>(current ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // Responders + assistants are the natural override candidates; custom
  // agents are allowed too in case the user has pinned a one-off persona.
  const candidates = agents.filter(
    (a) => a.role === 'responder' || a.role === 'assistant' || a.role === 'custom',
  );

  const onChange = async (next: string) => {
    const prev = value;
    setValue(next);
    setError(undefined);
    try {
      await apiSend(`/api/telegram/chats/${chatId}`, 'PATCH', { responderAgentId: next || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
      setValue(prev);
      return;
    }
    startTransition(() => {
      void queryClient.invalidateQueries({ queryKey: ['debug', 'telegram'] });
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value || NO_OVERRIDE}
        onValueChange={(next) => onChange(next === NO_OVERRIDE ? '' : next)}
        disabled={pending}
      >
        <SelectTrigger
          className="h-8 w-48 text-xs"
          title="Pin a specific responder agent to this chat. Default = global priority."
          aria-label="Responder agent override"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERRIDE}>— default —</SelectItem>
          {candidates.map((a) => (
            <SelectItem key={a.id} value={a.id} disabled={!a.enabled}>
              {a.name}
              {!a.enabled ? ' (disabled)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-[10px] text-destructive-ink">{error}</span>}
    </div>
  );
}
