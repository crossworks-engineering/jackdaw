'use client';

import { ArrowRight } from 'lucide-react';
import type { AccessLevel } from '@mantle/client-types';
import type { TreeVisibilityChange, TreeVisibilityRefusal } from '@mantle/web-ui/types/tree';
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
import { LEVEL_LABEL } from '@/lib/access-levels';
import { refusalHeading } from './sharing';

const levelWord = (l: AccessLevel) => (l === 'admin' ? 'Admin only' : LEVEL_LABEL[l]);

/** A tree write the brain refused because it changes who can see items: the
 *  items and their levels before and after. Going ahead repeats the write
 *  with `confirm` (and `seen`, the total shown, where the route takes it). */
export type PendingConfirm = {
  refusal: TreeVisibilityRefusal;
  /** What the write does, one sentence ("Move “Plan” into Clients."). */
  action: string;
  /** The button that goes ahead ("Move", "Share"). */
  verb: string;
  /** The sentence after `action`; defaults to the tree's own. */
  note?: string;
  run: () => void;
};

/** The tree's words for why a list like this appears. */
export const TREE_CONFIRM_NOTE =
  'Items take the share of the folder they sit in, for everyone on this brain.';

function ChangeList({
  label,
  changes,
  more,
}: {
  label: string;
  changes: readonly TreeVisibilityChange[];
  more: number;
}) {
  return (
    <ul
      aria-label={label}
      className="max-h-48 overflow-y-auto scrollbar-thin rounded-md border border-border text-sm"
    >
      {changes.map((c) => (
        <li
          key={c.id}
          className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate" title={c.title}>
            {c.title || 'Untitled'}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {levelWord(c.from)}
            <ArrowRight className="size-3" aria-label="becomes" />
            <span className="font-medium text-foreground">{levelWord(c.to)}</span>
          </span>
        </li>
      ))}
      {more > 0 && <li className="px-3 py-1.5 text-xs text-muted-foreground">and {more} more</li>}
    </ul>
  );
}

export function VisibilityConfirmDialog({
  pending,
  onOpenChange,
}: {
  pending: PendingConfirm | null;
  onOpenChange: (open: boolean) => void;
}) {
  const refusal = pending?.refusal;
  const more = refusal ? refusal.total - refusal.changes.length : 0;
  const lowered = refusal?.alsoLowered ?? [];
  return (
    <AlertDialog open={pending !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{refusal ? refusalHeading(refusal) : ''}</AlertDialogTitle>
          <AlertDialogDescription>
            {pending?.action} {pending?.note ?? TREE_CONFIRM_NOTE}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {refusal && (
          <ChangeList label="Who can see each item" changes={refusal.changes} more={more} />
        )}
        {lowered.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Also goes down with them</p>
            <p className="text-xs text-muted-foreground">
              What these embed goes down to the level they are read at, and keeps it after an
              unshare.
            </p>
            <ChangeList label="What goes down with them" changes={lowered} more={0} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => pending?.run()}>{pending?.verb}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
