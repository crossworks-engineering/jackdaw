'use client';

/**
 * Revoke one contact's team code (the old team-code portal). The code stops
 * working at once: every team request re-checks it, so an open session ends
 * mid-use. There is no way to mint a new code here on purpose: new people get
 * a login (Settings > Users). Server: POST /api/contacts/[id]/team
 * { action: 'disable' }.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { useToast } from '@mantle/web-ui/ui/toast';
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

export function RevokeCodeButton({ contactId, name }: { contactId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  async function revoke() {
    setBusy(true);
    try {
      await apiSend(`/api/contacts/${contactId}/team`, 'POST', { action: 'disable' });
      toast.success(`${name}'s team code is revoked`);
      await queryClient.invalidateQueries({ queryKey: ['team-admin', 'members'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke the code');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={busy}>
        <KeyRound />
        Revoke code
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {name}&rsquo;s team code?</AlertDialogTitle>
            <AlertDialogDescription>
              The code stops working now, and any open session ends. Their forum posts stay. You
              cannot issue a new code: give them a login in Settings &gt; Users instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
