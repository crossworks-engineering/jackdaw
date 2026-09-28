'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Send, ShieldCheck, Undo2, Users } from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  isWithAdmin,
  memberSpace,
  refusalMessage,
  statusLabels,
  type SpaceItemRow,
  type SpaceSharing,
} from '@/lib/member-space';

/**
 * Where an own item stands (plan section 7, StatusChip): who can see it
 * (Private / Shared with team) and, once it has left draft, its review state.
 * An item an admin took over says only that (audit F07; `statusLabels`).
 */
export function StatusChip({ row }: { row: Pick<SpaceItemRow, 'sharing' | 'reviewState'> }) {
  const { sharing, review } = statusLabels(row);
  if (!sharing) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="size-3" aria-hidden /> {review}
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className="gap-1 font-normal">
        {row.sharing === 'team' ? (
          <Users className="size-3" aria-hidden />
        ) : (
          <Lock className="size-3" aria-hidden />
        )}
        {sharing}
      </Badge>
      {review ? (
        <Badge variant={row.reviewState === 'returned' ? 'destructive' : 'secondary'}>
          {review}
        </Badge>
      ) : null}
    </span>
  );
}

/** A refusal from the brain carries a sentence the member can read (quota,
 *  embed, frozen, a rate limit, …); anything else gets the caller's. */
function messageOf(err: unknown, fallback: string): string {
  return refusalMessage(err) ?? fallback;
}

/** Refresh everything that shows this item (its detail, the lists, home). */
function useRefreshItem() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['member-space-item'] });
    void qc.invalidateQueries({ queryKey: ['member-space-list'] });
    void qc.invalidateQueries({ queryKey: ['member-home'] });
  };
}

/** Private or shared with the team (members cannot pick client or public). */
export function SharingControl({ row }: { row: SpaceItemRow }) {
  const toast = useToast();
  const refresh = useRefreshItem();
  const m = useMutation({
    mutationFn: (sharing: SpaceSharing) => memberSpace.share(row.id, sharing),
    onSuccess: refresh,
    onError: (err) => toast.error(messageOf(err, 'Could not change who can see this.')),
  });
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={row.sharing}
      disabled={m.isPending || row.reviewState === 'accepted'}
      onValueChange={(v) => v && v !== row.sharing && m.mutate(v as SpaceSharing)}
      aria-label="Who can see this"
    >
      <ToggleGroupItem value="private" className="gap-1 text-xs">
        <Lock className="size-3" aria-hidden /> Private
      </ToggleGroupItem>
      <ToggleGroupItem value="team" className="gap-1 text-xs">
        <Users className="size-3" aria-hidden /> Team
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * Submit for review, or Recall while it waits. Submit sends the SAVED version,
 * so unsaved edits must be saved first (`beforeSubmit` saves them); once
 * submitted the item is frozen until Recall, Accept or Return.
 */
export function ReviewActions({
  row,
  beforeSubmit,
  onRefused,
}: {
  row: SpaceItemRow;
  beforeSubmit?: () => Promise<boolean>;
  /** A refusal the item view shows itself (the bundle items Submit wants
   *  saved first): true when it did, so no toast repeats it. */
  onRefused?: (err: unknown) => boolean;
}) {
  const toast = useToast();
  const refresh = useRefreshItem();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (err) {
      if (!onRefused?.(err)) toast.error(messageOf(err, fail));
    } finally {
      setBusy(false);
    }
  };
  // Accepted, or with an admin: nothing of the review is the member's to do.
  if (row.reviewState === 'accepted' || isWithAdmin(row) || row.reviewState === 'taken') {
    return null;
  }
  if (row.reviewState === 'submitted') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(
            () => memberSpace.recall(row.id),
            'Recalled. You can edit it again.',
            'Could not recall it.',
          )
        }
      >
        <Undo2 /> Recall
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={() =>
        run(
          async () => {
            if (beforeSubmit && !(await beforeSubmit())) throw new Error('not saved');
            return memberSpace.submit(row.id);
          },
          'Submitted for review.',
          'Could not submit it.',
        )
      }
    >
      <Send /> {row.reviewState === 'returned' ? 'Resubmit' : 'Submit'}
    </Button>
  );
}

export { messageOf as spaceErrorMessage };
