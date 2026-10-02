'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { AccessLevel } from '@mantle/client-types';
import { apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
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
import { LEVEL_LABEL, LEVEL_ORDER, isAccessLevel } from '@/lib/access-levels';
import {
  GROUP_LEVEL_MEANING,
  GROUP_LEVEL_UNKNOWN,
  levelNeedsConfirm,
  type ToolGroupWithLevel,
} from '@/lib/tool-group-level';

type Refusal = { message: string; agents: string[] };

/** The brain's refusal, as it sends it. `group_above_agent` names each agent
 *  that holds the group, joined by "; ": one line each. */
function refusalOf(e: unknown): Refusal {
  const message = e instanceof Error ? e.message : 'Could not change the level.';
  const code = e instanceof ApiError ? e.body?.code : undefined;
  return code === 'group_above_agent'
    ? { message, agents: message.split('; ').filter(Boolean) }
    : { message, agents: [] };
}

/**
 * The level of one tool group. Saves at once through its own route, apart
 * from the group form, and works for connector groups too (the level is not
 * the connector's). Before client or public it asks first.
 */
export function GroupLevelSection({ group }: { group: ToolGroupWithLevel }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<AccessLevel | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const level = group.audience;

  const mutation = useMutation({
    mutationFn: (audience: AccessLevel) =>
      apiSend<{ tool_group: { slug: string; audience: AccessLevel } }>(
        `/api/access/tool-groups/${encodeURIComponent(group.slug)}`,
        'PATCH',
        { audience },
      ),
    onMutate: () => setRefusal(null),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tool-groups'] });
      toast.success(`${group.name} is now at ${LEVEL_LABEL[res.tool_group.audience]} level`);
    },
    onError: (e) => setRefusal(refusalOf(e)),
  });

  const pick = (v: string) => {
    // Empty = a press on the picked item: keep it.
    if (!isAccessLevel(v) || v === level) return;
    if (levelNeedsConfirm(level, v)) setConfirm(v);
    else mutation.mutate(v);
  };

  return (
    <section
      className="space-y-2 rounded-lg border border-border p-3"
      aria-labelledby="group-level"
    >
      <p id="group-level" className="text-sm font-medium">
        Level
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        size="default"
        className="w-full"
        loop={false}
        value={level ?? ''}
        disabled={level === undefined || mutation.isPending}
        onValueChange={pick}
        aria-labelledby="group-level"
      >
        {LEVEL_ORDER.map((l) => (
          <ToggleGroupItem key={l} value={l} className="flex-1" aria-label={LEVEL_LABEL[l]}>
            {LEVEL_LABEL[l]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {level === undefined ? GROUP_LEVEL_UNKNOWN : GROUP_LEVEL_MEANING[level]}
      </p>
      {refusal && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive-ink"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {refusal.agents.length > 0 ? (
            <div className="min-w-0 space-y-1">
              <p>The level did not change. An agent may hold a group only at a level it reads:</p>
              <ul className="list-disc pl-4">
                {refusal.agents.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p>Change those agents&apos; levels, or take this group off them, then try again.</p>
            </div>
          ) : (
            <p className="min-w-0">{refusal.message}</p>
          )}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Set “{group.name}” to {confirm ? LEVEL_LABEL[confirm] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{confirm ? GROUP_LEVEL_MEANING[confirm] : ''}</p>
                <p>
                  {confirm === 'public'
                    ? 'A public agent answers people who are not signed in. Every tool in this group can then run for them.'
                    : 'A client agent answers signed-in clients. Every tool in this group can then run for them.'}{' '}
                  This group holds {group.toolSlugs.length} tool
                  {group.toolSlugs.length === 1 ? '' : 's'}.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) mutation.mutate(confirm);
                setConfirm(null);
              }}
            >
              Set to {confirm ? LEVEL_LABEL[confirm] : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
