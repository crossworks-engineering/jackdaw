'use client';

/**
 * Re-curate pools — the button that reruns the shortlist ranking.
 *
 * WHY: the curated pools are a snapshot of somebody's judgement on one day and
 * nothing ages them. The shipped template sat untouched for a month, and by
 * then two of its entries pointed at models OpenRouter had delisted, several
 * carried prices off by up to 5x, and seven vendors had shipped auto-updating
 * `-latest` aliases no pool offered. A stale shortlist looks exactly like a
 * considered one, so the fix had to be something an owner can SEE and press.
 *
 * It drives the `curate-pools` maintenance task through the same
 * /api/debug/maintenance/run endpoint the Maintenance tab uses, so the rails
 * (single-flight, env checks, spend confirms) are the server's, not ours.
 *
 * Preview first, always: applying REPLACES every pool, because a fresh ranking
 * merged into a stale one yields an order that is neither. The dialog shows
 * the plan's own output and only then offers the apply.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import type { MaintenanceRunView } from '@mantle/web-ui/types/maintenance';

const SLUG = 'curate-pools';

export function RecurateDialog({ onApplied }: { onApplied: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<MaintenanceRunView | null>(null);
  const [starting, setStarting] = useState(false);
  /** Did the run now showing actually write? Gates the "apply" affordance. */
  const [appliedOnce, setAppliedOnce] = useState(false);
  const consoleRef = useRef<HTMLPreElement>(null);

  const running = run?.state === 'running';
  const previewed = run?.state === 'done' && run.live === false && run.exitCode === 0;

  const start = useCallback(
    async (apply: boolean) => {
      setStarting(true);
      try {
        const r = await apiSend<{ run: MaintenanceRunView | null }>(
          '/api/debug/maintenance/run',
          'POST',
          { slug: SLUG, apply },
        );
        setRun(r.run);
        if (apply) setAppliedOnce(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not start the run.');
      } finally {
        setStarting(false);
      }
    },
    [toast],
  );

  // Poll while a run is in flight. Same cadence as the Maintenance tab.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const data = await apiFetch<{ run: MaintenanceRunView | null }>(
          '/api/debug/maintenance/run',
        );
        setRun(data.run);
        if (data.run && data.run.state !== 'running' && data.run.live) onApplied();
      } catch {
        // transient poll failure — the next tick retries
      }
    }, 1200);
    return () => clearInterval(t);
  }, [running, onApplied]);

  // Keep the newest output visible.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run?.lines.length]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setRun(null);
      setAppliedOnce(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(true)}>
        <RefreshCw /> Re-curate
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Re-curate every pool</DialogTitle>
            <DialogDescription>
              Ranks every pool from live evidence: OpenRouter&apos;s catalog, Artificial Analysis
              benchmark scores, and real OpenRouter traffic. No model is invoked, so this costs no
              tokens. Preview first — applying replaces the contents of every pool.
            </DialogDescription>
          </DialogHeader>

          {run ? (
            <pre
              ref={consoleRef}
              className="max-h-80 overflow-auto scrollbar-thin rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed"
            >
              {run.lines.join('\n') || 'Starting…'}
            </pre>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing run yet. Preview shows the shortlist it would write, and changes nothing.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={running || starting}
              onClick={() => void start(false)}
            >
              {running && !run?.live ? <Spinner /> : null} Preview
            </Button>
            <Button
              type="button"
              // Deliberately gated on a clean preview: this replaces every
              // pool, and an owner should have read what it plans to write.
              disabled={!previewed || running || starting || appliedOnce}
              onClick={() => void start(true)}
            >
              {running && run?.live ? <Spinner /> : null} Apply to my pools
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
