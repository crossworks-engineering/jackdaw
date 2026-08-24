'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { invalidateAgentQueries } from '@mantle/web-ui/agent-invalidation';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@mantle/web-ui/ui/table';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ListCard, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { cn } from '@mantle/web-ui/lib/utils';
import { ModelsNav } from '../models-nav';

type ComboTarget = {
  id: string;
  targetKind: 'agent' | 'worker';
  label: string;
  pool: string;
  pick: string | null;
  current: { provider: string; model: string };
  next: { provider: string; model: string; apiKeyId: string } | null;
  changed: boolean;
  reason?: string;
};

type Combo = {
  key: string;
  label: string;
  description: string;
  targets: ComboTarget[];
  changed: number;
  blocked: number;
};

export function CombosClient({ initialCombo }: { initialCombo: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['model-combos'],
    queryFn: () => apiFetch<{ combos: Combo[] }>('/api/model-combos'),
  });
  const [comboKey, setComboKey] = useState(initialCombo);
  // Exclusions are per-combo and reset when the data refetches after apply.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);

  if (q.isPending) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!q.data) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Couldn’t load combinations{q.error instanceof Error ? ` — ${q.error.message}` : ''}. This
        needs a brain running v0.232.51+.
      </p>
    );
  }
  const combos = q.data.combos;
  const combo = combos.find((c) => c.key === comboKey) ?? combos[0];
  if (!combo) return null;
  const changedRows = combo.targets.filter((t) => t.changed && t.next);
  const selectedCount = changedRows.filter((t) => !excluded.has(t.id)).length;
  const blockedRows = combo.targets.filter((t) => t.reason);
  const untouchedCount = combo.targets.length - changedRows.length - blockedRows.length;

  async function apply() {
    if (!combo) return;
    setConfirming(false);
    setApplying(true);
    try {
      const res = await apiSend<{
        applied: string[];
        failed: { id: string; error: string }[];
      }>('/api/model-combos/apply', 'POST', {
        combo: combo.key,
        exclude: [...excluded],
      });
      if (res.failed.length === 0) {
        toast.success(
          `Applied ${res.applied.length} model change${res.applied.length === 1 ? '' : 's'}`,
        );
      } else {
        toast.error(`${res.applied.length} applied, ${res.failed.length} failed`);
      }
      setExcluded(new Set());
      await invalidateAgentQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ['model-combos'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apply failed.');
    } finally {
      setApplying(false);
    }
  }

  const list = (
    <>
      <div className="border-b border-border p-3">
        <ModelsNav />
      </div>
      <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto md:scrollbar-thin">
        {combos.map((c) => (
          <ListCard
            key={c.key}
            onClick={() => {
              setComboKey(c.key);
              setExcluded(new Set());
            }}
            selected={c.key === combo.key}
          >
            <ListCardTitle>{c.label}</ListCardTitle>
            <span className="block text-xs text-muted-foreground">{c.description}</span>
            <span className="block text-xs tabular-nums text-muted-foreground">
              {c.changed} change{c.changed === 1 ? '' : 's'}
              {c.blocked ? ` · ${c.blocked} blocked` : ''}
            </span>
          </ListCard>
        ))}
      </div>
    </>
  );

  const detail = (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">{combo.label}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{combo.description}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        One decision instead of thirteen: each combination picks a model from every curated pool.
        Derived live from your pools — re-curate and the combinations follow. Applying changes what
        the selected agents and workers actually run; nothing is automatic.
      </p>

      {changedRows.length === 0 && blockedRows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Everything already matches “{combo.label}” — nothing to apply.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Target</TableHead>
                <TableHead>Pool</TableHead>
                <TableHead>Current</TableHead>
                <TableHead className="w-6" />
                <TableHead>New</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changedRows.map((t) => (
                <TableRow key={t.id} className={cn(excluded.has(t.id) && 'opacity-50')}>
                  <TableCell>
                    <Checkbox
                      checked={!excluded.has(t.id)}
                      onCheckedChange={(on) =>
                        setExcluded((cur) => {
                          const copy = new Set(cur);
                          if (on) copy.delete(t.id);
                          else copy.add(t.id);
                          return copy;
                        })
                      }
                      aria-label={`Include ${t.label}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{t.label}</span>{' '}
                    <span className="text-xs text-muted-foreground">({t.targetKind})</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.pool}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.current.provider}: {t.current.model}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.next!.provider}: {t.next!.model}
                  </TableCell>
                </TableRow>
              ))}
              {combo.targets
                .filter((t) => !t.changed && !t.reason)
                .map((t) => (
                  <TableRow key={t.id} className="opacity-60">
                    <TableCell>
                      <Check className="size-3.5 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <span>{t.label}</span>{' '}
                      <span className="text-xs text-muted-foreground">({t.targetKind})</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.pool}</TableCell>
                    <TableCell className="font-mono text-xs" colSpan={3}>
                      {t.current.provider}: {t.current.model}{' '}
                      <span className="text-xs text-muted-foreground">— already matches</span>
                    </TableCell>
                  </TableRow>
                ))}
              {blockedRows.map((t) => (
                <TableRow key={t.id} className="opacity-60">
                  <TableCell />
                  <TableCell>
                    <span>{t.label}</span>{' '}
                    <span className="text-xs text-muted-foreground">({t.targetKind})</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.pool}</TableCell>
                  <TableCell className="text-xs text-warning-ink" colSpan={3}>
                    {t.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {changedRows.length} change{changedRows.length === 1 ? '' : 's'}{' '}
          selected
          {untouchedCount > 0 ? ` · ${untouchedCount} already match` : ''}
        </span>
        <Button
          type="button"
          disabled={selectedCount === 0 || applying}
          onClick={() => setConfirming(true)}
        >
          {applying ? 'Applying…' : `Apply ${combo.label}`}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Same scaffold and widths as /models/pools: the diff table tucks left
          with a draggable right edge, and the spacer holds the slack. */}
      <MasterDetail
        id="model-combos"
        defaultListSize="300px"
        defaultDetailSize="900px"
        maxDetailSize="100%"
        list={list}
        detail={detail}
      />
      <AlertDialog open={confirming} onOpenChange={(o) => !o && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply “{combo.label}” — {selectedCount} change{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This changes which models the selected agents and workers actually run, starting with
              their next turn. Prompts, params, keys for unchanged routes, and backups are
              untouched. You can switch any of them back individually in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
