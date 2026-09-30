'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '@mantle/web-ui/api-fetch';
import { Label } from '@mantle/web-ui/ui/label';
import { Switch } from '@mantle/web-ui/ui/switch';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  APP_INFORMATIONAL_HINT,
  APP_INFORMATIONAL_LABEL,
  informationalPatch,
  supportsInformational,
} from '@/lib/app-informational';
import type { AppDetail } from '@/lib/contract-next';

/**
 * The admin's informational switch on an app (client logins C6): on, members
 * and clients only READ the app's data; off (the default), a team or client
 * app is a shared workspace written by everyone who runs it. One PATCH of the
 * owner app route; the cached app detail takes the answer in place (never a
 * refetch, which would re-sync the editor's source tree). Shown only by a
 * brain that knows the flag: a brain before C6 sends no `dataReadOnly`.
 */
export function AppInformationalSwitch({ app }: { app: AppDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const id = useId();
  // The value being sent, until the brain answers; then the app's own.
  const [sending, setSending] = useState<boolean | null>(null);
  if (!supportsInformational(app)) return null;
  const on = sending ?? app.dataReadOnly === true;

  const change = async (next: boolean) => {
    setSending(next);
    try {
      await apiSend(`/api/apps/${encodeURIComponent(app.id)}`, 'PATCH', informationalPatch(next));
      qc.setQueriesData<{ app: AppDetail }>(
        { predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'string' },
        (d) => (d?.app?.id === app.id ? { ...d, app: { ...d.app, dataReadOnly: next } } : d),
      );
      // The /apps LIST pages only, as the look picker does.
      void qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'apps' && typeof q.queryKey[1] === 'object',
      });
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
        onCheckedChange={(v) => void change(v)}
        aria-describedby={`${id}-hint`}
      />
      <Label htmlFor={id} className="font-normal">
        {APP_INFORMATIONAL_LABEL}
      </Label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {APP_INFORMATIONAL_HINT}
      </p>
    </div>
  );
}
