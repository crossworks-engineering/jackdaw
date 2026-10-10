'use client';

import { ArrowRight } from 'lucide-react';
import type { AccessLevel } from '@mantle/client-types';
import type { TreeVisibilityChange } from '@mantle/web-ui/types/tree';
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
import {
  isWorkspaceChange,
  refusalHeading,
  workspaceChangeWords,
  type VisibilityChange,
  type VisibilityRefusal,
} from './sharing';

const levelWord = (l: AccessLevel) => (l === 'admin' ? 'Admin only' : LEVEL_LABEL[l]);

/** A write the brain refused because it changes who can see items: each
 *  item and the workspaces it gains and loses (a tree write, W5b2 contract
 *  29), or its levels before and after (a member review accept, until W5c).
 *  Going ahead repeats the write with `confirm` (and `seen`, the total
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

/** A node type as people say it, for the embed list (an embed may open
 *  any workspace item, so the kind matters). */
function kindWord(type: string): string {
  const words: Record<string, string> = {
    file: 'file',
    draw: 'drawing',
    page: 'page',
    note: 'note',
    table: 'table',
    app: 'app',
    formula: 'formula',
    branch: 'folder',
  };
  return words[type] ?? type;
}

export function ChangeList({
  label,
  changes,
  more,
}: {
  label: string;
  changes: readonly VisibilityChange[];
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
          {isWorkspaceChange(c) ? <WorkspaceDelta change={c} /> : <LevelDelta change={c} />}
        </li>
      ))}
      {more > 0 && <li className="px-3 py-1.5 text-xs text-muted-foreground">and {more} more</li>}
    </ul>
  );
}

/** A tree change: the workspaces that also read the item, and those that
 *  stop (contract 29). */
function WorkspaceDelta({ change }: { change: Parameters<typeof workspaceChangeWords>[0] }) {
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

/** A review accept's change: its level before and after (until W5c). */
function LevelDelta({ change: c }: { change: TreeVisibilityChange }) {
  return (
    <>
      {c.type && (
        <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
          {kindWord(c.type)}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {levelWord(c.from)}
        <ArrowRight className="size-3" aria-label="becomes" />
        <span className="font-medium text-foreground">{levelWord(c.to)}</span>
      </span>
    </>
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
  const embeds = refusal?.alsoEmbeds ?? [];
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
        {embeds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Also readable through them</p>
            <p className="text-xs text-muted-foreground">
              What these embed is read wherever they are read, only while they are. Its own level
              does not change.
            </p>
            <ChangeList label="What they embed" changes={embeds} more={0} />
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
