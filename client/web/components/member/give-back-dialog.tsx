'use client';

import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@mantle/web-ui/ui/dialog';
import { giveBackRefusal, type GiveBackRefusal } from '@/lib/admin-private';
import { adminSpace, type AdminSpaceItemRow, type AdminTakenFrom } from '@/lib/member-space';
import { adminItemResolver, ItemLinksNotice } from './item-links-notice';

/**
 * Give back (audit F07): an item the admin took over from the Review queue
 * goes back to its member (no note: review flows carry no messages), with
 * everything taken with it. The
 * member sees it as returned, edits it and submits it again. A refusal stays
 * in the dialog: the member cannot take it any more (accept or delete it),
 * unsaved edits (save first), or something the member may not see (remove
 * it first), the last two naming the items.
 */
export function GiveBackDialog({
  row,
  from,
  beforeGiveBack,
  onGivenBack,
  onRefused,
}: {
  row: Pick<AdminSpaceItemRow, 'id' | 'title'>;
  from: AdminTakenFrom;
  /** Runs first (the editor sending what was typed); false stops it. */
  beforeGiveBack?: () => Promise<boolean>;
  onGivenBack: () => void;
  /** After a refusal: the row may have changed (e.g. the member was
   *  deactivated, so Give back is gone and Delete is offered). */
  onRefused?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<GiveBackRefusal | null>(null);
  const send = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      if (beforeGiveBack && !(await beforeGiveBack())) return;
      await adminSpace.giveBack(row.id);
      toast.success(`Gave “${row.title || 'Untitled'}” back to ${from.name}.`);
      setOpen(false);
      onGivenBack();
    } catch (err) {
      setRefusal(giveBackRefusal(err));
      onRefused?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setRefusal(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Undo2 /> Give back
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give back to {from.name}</DialogTitle>
          <DialogDescription>
            “{row.title || 'Untitled'}” goes back to {from.name}&rsquo;s space, with everything you
            took over with it. They can change it and submit it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {refusal ? (
            refusal.ids.length ? (
              <ItemLinksNotice
                message={refusal.message}
                ids={refusal.ids}
                resolve={adminItemResolver(adminSpace)}
              />
            ) : (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
              >
                {refusal.message}
              </p>
            )
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void send()}>
              {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
              Give back
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
