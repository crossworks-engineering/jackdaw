'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Label } from '@mantle/web-ui/ui/label';
import { Switch } from '@mantle/web-ui/ui/switch';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  APP_MCP_ACCESS_HINT,
  APP_MCP_ACCESS_LABEL,
  isMcpAccessOn,
  mcpAccessPatch,
  supportsMcpAccess,
  type WithMcpAccess,
} from '@/lib/app-mcp-access';
import type { AppDetail } from '@mantle/client-types';

/**
 * The admin's MCP access switch on an app (brain team apps Phase 1), beside
 * Informational: on, a member's or client's own MCP connection reaches the
 * app's data. One PATCH of the owner app route; the cached app detail takes
 * the answer in place (never a refetch, which would re-sync the editor's
 * source tree), as AppInformationalSwitch does. Shown only by a brain that
 * knows the flag.
 */
export function AppMcpAccessSwitch({ app }: { app: AppDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const id = useId();
  const [sending, setSending] = useState<boolean | null>(null);
  const flagged = app as AppDetail & WithMcpAccess;
  if (!supportsMcpAccess(flagged)) return null;
  const on = sending ?? isMcpAccessOn(flagged);

  const change = async (next: boolean) => {
    setSending(next);
    try {
      await apiSend(`/api/apps/${encodeURIComponent(app.id)}`, 'PATCH', mcpAccessPatch(next));
      qc.setQueriesData<{ app: AppDetail }>(
        { predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'string' },
        (d) =>
          d?.app?.id === app.id ? { ...d, app: Object.assign({}, d.app, { mcpAccess: next }) } : d,
      );
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'object',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the app.');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <Switch
        id={id}
        checked={on}
        disabled={sending !== null}
        onCheckedChange={(v) => void change(v)}
        aria-describedby={`${id}-hint`}
      />
      <Label htmlFor={id} className="font-normal">
        {APP_MCP_ACCESS_LABEL}
      </Label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {APP_MCP_ACCESS_HINT}
      </p>
    </div>
  );
}
