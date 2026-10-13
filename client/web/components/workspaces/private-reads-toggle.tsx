'use client';

/**
 * The Read posture switch (the member settings on the Admin workspace's
 * screen, shown to an Admin user): the owner's `teamPrivateReads`. It has
 * no effect any more (READ_POSTURE_TEXT says why); it stays so an Admin
 * user can see and clear it. Default off.
 */
import { useState } from 'react';
import { Switch } from '@mantle/web-ui/ui/switch';
import { Label } from '@mantle/web-ui/ui/label';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { READ_POSTURE_TEXT, TEAM_SETTINGS_PATH } from './team-settings-query';
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

export function PrivateReadsToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  const persist = async (next: boolean) => {
    setEnabled(next); // optimistic
    setPending(true);
    try {
      await apiSend(TEAM_SETTINGS_PATH, 'PATCH', { teamPrivateReads: next });
      toast.success(
        next
          ? 'Expose email & journal is on. It has no effect any more.'
          : 'Expose email & journal is off.',
      );
    } catch {
      setEnabled(!next); // revert
      toast.error('Could not update the setting. Try again.');
    } finally {
      setPending(false);
    }
  };

  // Enabling exposes private data → confirm first. Disabling is the safe
  // direction and applies immediately.
  const onChange = (next: boolean) => {
    if (next) setConfirmOpen(true);
    else void persist(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="teamPrivateReads" className="text-xs text-muted-foreground">
          Expose email &amp; journal
        </Label>
        <Switch
          id="teamPrivateReads"
          checked={enabled}
          onCheckedChange={onChange}
          disabled={pending}
          aria-label="Expose email and journal (no effect any more)"
        />
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on Expose email &amp; journal?</AlertDialogTitle>
            <AlertDialogDescription>{READ_POSTURE_TEXT}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void persist(true)}>Turn on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
