'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppDetail } from '@mantle/client-types';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Label } from '@mantle/web-ui/ui/label';
import { Switch } from '@mantle/web-ui/ui/switch';
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
import {
  APP_TRUST_LABEL,
  APP_TRUST_OFF_HINT,
  APP_TRUST_ON_HINT,
  APP_TRUST_TOOLS_HINT,
  appAuthorLevel,
} from '@/lib/space-apps';

/**
 * The admin's "Trust its tools" switch (brain team apps Phase 3, M3 audit):
 * the author ceiling of an app in the brain. Off, the app runs its tools at
 * team rules for everyone, admins too (a member wrote it, or it came from a
 * copy, an import or a member-era restore). On lifts it, after a confirm
 * that says what the code can then do. One PATCH of the owner app route
 * (`{ trustTools }`), its one writer. Shown only by a brain that sends the
 * ceiling, and only while it is on or an admin turns it off again.
 */
export function AppTrustToolsSwitch({ app }: { app: AppDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const id = useId();
  const [sending, setSending] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState(false);
  const level = appAuthorLevel(app);
  // An admin's own app (never capped) shows nothing.
  const [seenCapped] = useState(level === 'team');
  if (level === null || (level === 'admin' && !seenCapped)) return null;
  const on = sending ?? level === 'admin';

  const send = async (next: boolean) => {
    setSending(next);
    try {
      await apiSend(`/api/apps/${encodeURIComponent(app.id)}`, 'PATCH', { trustTools: next });
      qc.setQueriesData<{ app: AppDetail }>(
        { predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'string' },
        (d) =>
          d?.app?.id === app.id
            ? { ...d, app: { ...d.app, authorLevel: next ? 'admin' : 'team' } as AppDetail }
            : d,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the app.');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <Switch
        id={id}
        checked={on}
        disabled={sending !== null}
        onCheckedChange={(v) => (v ? setConfirm(true) : void send(false))}
        aria-describedby={`${id}-hint`}
      />
      <Label htmlFor={id} className="font-normal">
        {APP_TRUST_LABEL}
      </Label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {on ? APP_TRUST_ON_HINT : APP_TRUST_OFF_HINT}
      </p>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trust the tools of “{app.title || 'Untitled'}”?</AlertDialogTitle>
            <AlertDialogDescription>{APP_TRUST_TOOLS_HINT}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirm(false);
                void send(true);
              }}
            >
              Trust its tools
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
