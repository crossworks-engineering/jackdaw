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

/** The link a revoke is about to end. */
export type RevokeTarget = {
  shareId: string;
  title: string;
  /** Its sub-pages' links end with it. */
  cascade: boolean;
  /** What happens to the item's level, when worth saying ("It stays at
   *  Client, for signed-in clients."). */
  stays?: string | null;
};

/**
 * Confirm a link revoke: Shared links and the Access control both come
 * through here, so the words are the same wherever a link is ended. A
 * separate, state-controlled dialog (ui-style-guide §7): the Access control
 * opens it beside its popover, never inside it.
 */
export function RevokeLinkDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: RevokeTarget | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.cascade
              ? `"${target?.title}" and its shared sub-pages stop being accessible immediately. The content itself is untouched.`
              : `"${target?.title}" stops being accessible immediately. The content itself is untouched.`}
            {target?.stays ? ` ${target.stays}` : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep sharing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={busy}
          >
            Revoke link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The level note for a revoked old client link. */
export const STAYS_AT_CLIENT = 'It stays at Client, for signed-in clients.';
