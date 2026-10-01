'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { ToolDTO, ToolTeamAppsDTO } from '@mantle/client-types';
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

/** "Team apps may use" as the server reports it (`ToolDTO.teamApps`, mantle
 *  docs/member-logins.md "Outside tools in team apps"). */
export type ToolTeamApps = ToolTeamAppsDTO;

export type ToolWithTeamApps = ToolDTO;

/** Why this tool can't be opened to team apps as it stands, else null. Mirrors
 *  the server's rule; the server refuses anyway. */
function blockedReason(tool: ToolWithTeamApps): string | null {
  const h = tool.handler;
  if (h.kind === 'http' && (h.method === 'PUT' || h.method === 'PATCH' || h.method === 'DELETE')) {
    return `This tool sends ${h.method}, which changes data, so team apps can't use it.`;
  }
  if (tool.requiresConfirm) {
    return 'This tool needs your confirmation on every call. Nobody is there to confirm in an app, so team apps can’t use it.';
  }
  return null;
}

function who(t: ToolTeamApps): string {
  if (t.by.via === 'web') return t.by.actorEmail ?? 'an admin';
  if (t.by.via === 'mcp') return 'the owner’s MCP client';
  return 'the dev tool console';
}

/**
 * The switch on one outside tool (MCP or http). Only shown for those kinds:
 * built-ins need none, and recipe and shell tools can never get it. Saves at
 * once through its own route, apart from the tool form.
 */
export function TeamAppsSection({
  tool,
  onChanged,
}: {
  tool: ToolWithTeamApps;
  onChanged: (tool: ToolWithTeamApps) => void;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [readOnlyConfirmed, setReadOnlyConfirmed] = useState(false);

  const mutation = useMutation({
    mutationFn: (allow: boolean) =>
      apiSend<{ tool: ToolWithTeamApps }>(`/api/tools/${tool.id}/team-apps`, 'PUT', {
        allow,
        ...(allow ? { readOnlyConfirmed: true } : {}),
      }),
    onSuccess: (res, allow) => {
      onChanged(res.tool);
      toast.success(
        allow ? 'Team apps may now use this tool' : 'Team apps can no longer use this tool',
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change that.'),
  });

  if (tool.handler.kind !== 'mcp' && tool.handler.kind !== 'http') return null;

  const state = tool.teamApps ?? null;
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
    <section className="space-y-2 rounded-lg border border-border p-3" aria-labelledby="team-apps">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label id="team-apps" htmlFor="team-apps-switch" className="text-sm font-medium">
            Team apps may use
          </Label>
          <FieldHint
            id="team-apps-switch"
            className="mt-1 leading-relaxed"
            warn="Every team member can call this tool by hand, with any input, not only what an app's screens send. If it takes free SQL, a member can read anything the connector can read."
          >
            Lets team members&apos; apps call this tool. It must also be in an enabled team-level
            tool group, and the app must declare it. Client apps and public links never use it.
          </FieldHint>
        </div>
        <Switch
          id="team-apps-switch"
          checked={on}
          disabled={mutation.isPending || (!on && blocked !== null)}
          onCheckedChange={onToggle}
          className="mt-0.5 shrink-0"
        />
      </div>
      {on && state && (
        <p className="text-xs text-muted-foreground">
          Confirmed read-only by {who(state)} on{' '}
          {new Date(state.confirmedReadOnlyAt).toLocaleString()}.
        </p>
      )}
      {stale && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This tool changed after it was confirmed, so team apps can&apos;t use it now. Switch it on
          again to confirm the new version.
        </p>
      )}
      {!on && blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let team apps use “{tool.slug}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-warning-ink">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Every team member can call this tool through any team app that declares it. They
                    can also call it by hand, from their browser with their own login, with ANY
                    input, not only what the app&apos;s screens send. No model checks the calls.
                  </span>
                </p>
                <p>
                  If the tool takes free SQL or a free query, a member can read anything the
                  connector can read.
                </p>
                <p>
                  The brain can&apos;t see what an outside tool does. Switch this on only for a tool
                  that reads data and never changes it. Every call is logged with the member.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={readOnlyConfirmed}
              onCheckedChange={(v) => setReadOnlyConfirmed(v === true)}
              className="mt-0.5"
              aria-describedby="team-apps-confirm-hint"
            />
            <span id="team-apps-confirm-hint">I confirm this tool only reads data.</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!readOnlyConfirmed || mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Let team apps use it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
