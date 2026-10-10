'use client';

import { Button } from '@mantle/web-ui/ui/button';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
// Relative, not '@/': the node test runner renders this (link-served-list.test.ts).
import {
  serveCappedText,
  servedCountText,
  servedElsewhereText,
  servedHint,
  type ServeRow,
} from '../../lib/grants';

/** A node type as people say it. */
const KIND_WORD: Record<string, string> = {
  file: 'file',
  draw: 'drawing',
  page: 'page',
  note: 'note',
  table: 'table',
  app: 'app',
  formula: 'formula',
  task: 'task',
  event: 'event',
  branch: 'folder',
};

/**
 * What an open link shows besides its item (plan 8.1, contract 30 and 32):
 * the items the item names or embeds (a folder: the items in it) that the
 * user may edit, each with a tick. A ticked item opens for people with the
 * link; the rest show as private. Pure: the panel loads and writes.
 */
export function LinkServedList({
  rows,
  elsewhere,
  type,
  busy,
  onToggle,
}: {
  rows: readonly ServeRow[];
  /** Served items this user cannot change here (they stay served). */
  elsewhere: number;
  type: string | undefined;
  busy: boolean;
  /** Tick (`on`) or clear these items. */
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const served = rows.filter((r) => r.served).length + elsewhere;
  const other = servedElsewhereText(elsewhere);
  if (rows.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{servedCountText(served)}</p>
        {other && <p className="text-xs text-muted-foreground">{other}</p>}
      </div>
    );
  }
  const capped = serveCappedText(type, rows.length);
  const allOn = rows.every((r) => r.served);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium">What the link shows</p>
        {rows.length > 1 && (
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              onToggle(
                rows.filter((r) => r.served === allOn).map((r) => r.nodeId),
                !allOn,
              )
            }
          >
            {allOn ? 'Clear all' : 'Tick all'}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{servedHint(type)}</p>
      <ul
        aria-label="What the link shows"
        className="max-h-40 space-y-1 overflow-y-auto scrollbar-thin rounded-md border border-border p-1.5"
      >
        {rows.map((r) => (
          <li key={r.nodeId} className="flex min-w-0 items-center gap-2 text-sm">
            <Checkbox
              id={`serve-${r.nodeId}`}
              checked={r.served}
              disabled={busy}
              aria-label={`Show ${r.title || 'Untitled'}`}
              onCheckedChange={(v) => onToggle([r.nodeId], v === true)}
            />
            <label htmlFor={`serve-${r.nodeId}`} className="min-w-0 flex-1 truncate">
              {r.title || 'Untitled'}
            </label>
            <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
              {KIND_WORD[r.kind] ?? r.kind}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{servedCountText(served)}</p>
      {other && <p className="text-xs text-muted-foreground">{other}</p>}
      {capped && <p className="text-xs text-muted-foreground">{capped}</p>}
    </div>
  );
}
