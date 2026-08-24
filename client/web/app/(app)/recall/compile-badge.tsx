import { AlertTriangle, Check } from 'lucide-react';

/**
 * The compile-state chip, shared by the catalog, the map header, and the
 * editor badge. The compiler never blocks a commit, so this chip is how an
 * author learns a map is serving its last good rev.
 */
export function CompileBadge({ ok, compiled }: { ok: boolean; compiled: boolean }) {
  if (!ok) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-ink">
        <AlertTriangle className="size-3" aria-hidden />
        lint failed
      </span>
    );
  }
  if (!compiled) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        not compiled
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success-ink">
      <Check className="size-3" aria-hidden />
      compiled
    </span>
  );
}
