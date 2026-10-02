'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppToolConfirmRequest } from '@mantle/share-ui/app-sandbox';
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

/** How long "Run it" stays off after a question opens: a click meant for
 *  the app (or for an earlier question) never lands on it (apps audit
 *  2026-10-02, item 6). */
const ARM_DELAY_MS = 800;

/**
 * The owner's answer when a running app calls a tool that needs confirmation
 * (apps audit S1, mantle 0.232.385+). The brain answers such a call with a
 * ticket instead of running it; AppSandbox hands it here through its
 * `confirmTool` prop and runs the call only on Yes. This dialog belongs to
 * the host page, outside the app's sandboxed frame, so app code cannot click
 * it for the owner.
 *
 * Returns the prop to pass and the dialog to render once in the screen.
 */
export function useAppToolConfirm(): {
  confirmTool: (req: AppToolConfirmRequest) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [shown, setShown] = useState<AppToolConfirmRequest | null>(null);
  // The open question's answer. A ref, so the close that follows a button
  // click finds it already answered and does not answer it twice.
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const answer = useCallback((ok: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setShown(null);
    resolve?.(ok);
  }, []);

  const confirmTool = useCallback(
    (req: AppToolConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        // One question at a time (apps audit 2026-10-02, item 6): a second
        // call while one is open is declined, and the open one stays as it
        // is. Replacing it put a different call under the Run button the
        // owner was about to press, and an app could time that.
        if (resolver.current) {
          resolve(false);
          return;
        }
        resolver.current = resolve;
        setShown(req);
      }),
    [],
  );

  // "Run it" waits a moment after the question appears.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    if (!shown) return;
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, [shown]);

  // The whole input, never cut: the dialog scrolls (a cut hid the tail).
  const input = shown ? JSON.stringify(shown.input, null, 2) : '';
  const dialog = (
    <AlertDialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run “{shown?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This app wants to run a tool that needs your confirmation. It runs once, with the input
            below, and only if you say so.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {shown && (
          <div className="flex min-w-0 flex-col gap-2 text-sm">
            <p className="font-mono text-xs text-muted-foreground">{shown.slug}</p>
            {shown.description && <p className="text-muted-foreground">{shown.description}</p>}
            <pre className="max-h-64 overflow-auto scrollbar-thin rounded-md border border-border bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
              {input}
            </pre>
            {input.length > 2000 && (
              <p className="text-xs text-muted-foreground">
                The input is {input.length.toLocaleString()} characters long. Scroll to read all of
                it before you say yes.
              </p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Don&apos;t run it</AlertDialogCancel>
          <AlertDialogAction disabled={!armed} onClick={() => answer(true)}>
            Run it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmTool, dialog };
}
