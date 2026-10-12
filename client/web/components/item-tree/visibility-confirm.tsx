'use client';

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
  refusalHeading,
  workspaceChangeWords,
  type TreeWorkspaceChange,
  type VisibilityRefusal,
} from './sharing';

/** A write the brain refused because it changes who can see items: each
 *  item and the workspaces it gains and loses (a tree write, W5b2 contract
 *  29). Going ahead repeats the write with `confirm` (and `seen`, the total
 *  shown, where the route takes it). */
export type PendingConfirm = {
  refusal: VisibilityRefusal;
  /** What the write does, one sentence ("Move “Plan” into Clients."). */
  action: string;
  /** The button that goes ahead ("Move", "Share"). */
  verb: string;
  /** The sentence after `action`; defaults to the tree's own. */
  note?: string;
  run: () => void;
};

/** The tree's words for why a list like this appears. */
export const TREE_CONFIRM_NOTE = 'Items take the workspaces of the folder they sit in.';

export function ChangeList({
  label,
  changes,
  more,
}: {
  label: string;
  changes: readonly TreeWorkspaceChange[];
  more: number;
}) {
  return (
    <ul
      aria-label={label}
      className="max-h-48 overflow-y-auto scrollbar-thin rounded-md border border-border text-sm"
    >
      {changes.map((c, i) => (
        <li
          key={c.id || `new-${i}`}
          className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate" title={c.title}>
            {c.title || 'Untitled'}
          </span>
          <WorkspaceDelta change={c} />
        </li>
      ))}
      {more > 0 && <li className="px-3 py-1.5 text-xs text-muted-foreground">and {more} more</li>}
    </ul>
  );
}

/** A tree change: the workspaces that also read the item, and those that
 *  stop (contract 29). */
function WorkspaceDelta({ change }: { change: TreeWorkspaceChange }) {
  const { added, removed } = workspaceChangeWords(change);
  return (
    <span className="flex min-w-0 shrink flex-col items-end text-xs">
      {added && (
        <span className="truncate text-foreground" title={`Also visible to: ${added}`}>
          Also: <span className="font-medium">{added}</span>
        </span>
      )}
      {removed && (
        <span
          className="truncate text-muted-foreground"
          title={`No longer readable in: ${removed}`}
        >
          No longer: {removed}
        </span>
      )}
    </span>
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
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => pending?.run()}>{pending?.verb}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
