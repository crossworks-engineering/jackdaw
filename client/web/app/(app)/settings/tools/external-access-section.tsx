'use client';

import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { ToolDTO } from '@mantle/client-types';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Switch } from '@mantle/web-ui/ui/switch';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Label } from '@mantle/web-ui/ui/label';
import { FieldHint } from '@mantle/web-ui/ui/field-hint';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { useToast } from '@mantle/web-ui/ui/toast';

/**
 * "External access" as the server reports it (`ToolDTO.externalAccess`,
 * mantle docs/member-logins.md "External access: outside tools in shared
 * apps"). Typed here until the contract that carries it is published and
 * pinned; then this becomes `ToolExternalAccessDTO` from
 * `@mantle/client-types`.
 */
export type ToolExternalAccess = {
  /** False when the tool's handler changed after an admin confirmed it. */
  on: boolean;
  confirmedReadOnlyAt: string;
  by: { via: 'web' | 'mcp' | 'dev-tools'; actorId?: string; actorEmail?: string };
};

export type ToolWithExternalAccess = ToolDTO & { externalAccess?: ToolExternalAccess | null };

/** Why this tool can't get External access as it stands, else null. Mirrors
 *  the server's rule; the server refuses anyway. */
function blockedReason(tool: ToolWithExternalAccess): string | null {
  const h = tool.handler;
  if (h.kind === 'http' && (h.method === 'PUT' || h.method === 'PATCH' || h.method === 'DELETE')) {
    return `This tool sends ${h.method}, which changes data, so it can't get External access.`;
  }
  if (tool.requiresConfirm) {
    return 'This tool needs your confirmation on every call. Nobody is there to confirm in an app, so it can’t get External access.';
  }
  return null;
}

function who(t: ToolExternalAccess): string {
  if (t.by.via === 'web') return t.by.actorEmail ?? 'an admin';
  if (t.by.via === 'mcp') return 'the owner’s MCP client';
  return 'the dev tool console';
}

/**
 * The switch on one outside tool (MCP or http). Only shown for those kinds:
 * built-ins need none, and recipe and shell tools can never get it. Saves at
 * once through its own route, apart from the tool form.
 */
export function ExternalAccessSection({
  tool,
  onChanged,
  note,
}: {
  tool: ToolWithExternalAccess;
  onChanged: (tool: ToolWithExternalAccess) => void;
  /** A notice under the switch (`ConnectorOffNote`). */
  note?: ReactNode;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [readOnlyConfirmed, setReadOnlyConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: (allow: boolean) =>
      apiSend<{ tool: ToolWithExternalAccess }>(`/api/tools/${tool.id}/external-access`, 'PUT', {
        allow,
        ...(allow ? { readOnlyConfirmed: true } : {}),
      }),
    onSuccess: (res, allow) => {
      onChanged(res.tool);
      toast.success(allow ? 'External access is on' : 'External access is off');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change that.'),
  });

  if (tool.handler.kind !== 'mcp' && tool.handler.kind !== 'http') return null;

  const state = tool.externalAccess ?? null;
  const on = state?.on === true;
  const stale = state !== null && !on;
  const blocked = blockedReason(tool);

  const onToggle = (next: boolean) => {
    if (!next) {
      mutation.mutate(false);
      return;
    }
    setReadOnlyConfirmed(false);
    setConfirmOpen(true);
  };

  return (
    <section
      className="space-y-2 rounded-lg border border-border p-3"
      aria-labelledby="external-access"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label
            id="external-access"
            htmlFor="external-access-switch"
            className="text-sm font-medium"
          >
            External access
          </Label>
          <FieldHint
            id="external-access-switch"
            className="mt-1 leading-relaxed"
            warn="Everyone an app is shared with can call this tool by hand, with any input, not only what the app's screens send. If it takes free SQL, they can read anything the connector can read."
          >
            Lets shared apps that declare this tool call it, for everyone they are shared with: team
            members, clients, and contacts you send the app to. Open links never use it.
          </FieldHint>
        </div>
        <Switch
          id="external-access-switch"
          checked={on}
          disabled={mutation.isPending || (!on && blocked !== null)}
          onCheckedChange={onToggle}
          className="mt-0.5 shrink-0"
        />
      </div>
      {note}
      {on && state && (
        <p className="text-xs text-muted-foreground">
          Confirmed read-only by {who(state)} on{' '}
          {new Date(state.confirmedReadOnlyAt).toLocaleString()}.
        </p>
      )}
      {stale && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This tool changed after it was confirmed, so shared apps can&apos;t use it now. Switch it
          on again to confirm the new version.
        </p>
      )}
      {!on && blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Give “{tool.slug}” External access?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-warning-ink">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Everyone an app that declares this tool is shared with can call it: team
                    members, clients, and contacts you send the app to. They can also call it by
                    hand, from their browser, with ANY input, not only what the app&apos;s screens
                    send. No model checks the calls.
                  </span>
                </p>
                <p>
                  If the tool takes free SQL or a free query, they can read anything the connector
                  can read.
                </p>
                <p>
                  The brain can&apos;t see what an outside tool does. Switch this on only for a tool
                  that reads data and never changes it. Every call is logged with who made it.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={readOnlyConfirmed}
              onCheckedChange={(v) => setReadOnlyConfirmed(v === true)}
              className="mt-0.5"
              aria-describedby="external-access-confirm-hint"
            />
            <span id="external-access-confirm-hint">I confirm this tool only reads data.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!readOnlyConfirmed || mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Give External access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
