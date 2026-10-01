'use client';

/**
 * A contact's sharing (contact shares, brain migration 0214; brain
 * docs/contacts.md section 2b).
 *
 * - `ContactSharingBlock`: the "Enable sharing" switch, "Revoke all" beside
 *   it (confirm, names the count), when the code was last used, and a
 *   Locked badge with Regenerate. Enable and Regenerate show the code ONCE
 *   (`ContactCodeDialog`). Switching off asks first, names how many shares
 *   end, and revokes them all.
 * - `ContactSharedTab`: everything shared with the contact, newest first:
 *   kind, title (a link to the item), "Can write" for an app, shared at,
 *   last opened, and Revoke (the same call as Remove in the item's share
 *   dialog, so both screens agree).
 *
 * A brain before 0214 sends no `sharing` on its contacts; the contact page
 * then shows neither (brainHasContactShares).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Link2Off, Loader2, RefreshCw } from 'lucide-react';
import type { ContactShareRow, ContactSharing } from '@mantle/client-types';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { Switch } from '@mantle/web-ui/ui/switch';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { copyText } from '@mantle/web-ui/lib/secure-context-fallbacks';
import { formatDate, formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { kindLabel } from '@/lib/access-levels';
import { invalidateLinkQueries, revokeShareLink } from '@/lib/shared-links';
import {
  CODE_SHOWN_ONCE,
  contactSharesKey,
  disableSharingLine,
  fetchContactShares,
  lastUsedLine,
  revokeAllContactShares,
  revokeAllLine,
  setContactSharing,
} from '@/lib/contact-shares';

type Confirm = 'disable' | 'revoke-all' | null;

export function ContactSharingBlock({
  contactId,
  name,
  sharing,
}: {
  contactId: string;
  name: string;
  sharing: ContactSharing | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const on = !!sharing;
  const count = sharing?.shareCount ?? 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    invalidateLinkQueries(queryClient);
  };

  const run = async (action: 'enable' | 'regenerate' | 'disable') => {
    setBusy(true);
    try {
      const res = await setContactSharing(contactId, action);
      if (res.code) setCode(res.code);
      if (action === 'disable') {
        toast.success(
          res.revoked
            ? `Sharing off. ${res.revoked} share${res.revoked === 1 ? '' : 's'} ended.`
            : 'Sharing off.',
        );
      }
      setConfirm(null);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not change sharing');
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    try {
      const res = await revokeAllContactShares(contactId);
      toast.success(`${res.revoked} share${res.revoked === 1 ? '' : 's'} revoked.`);
      setConfirm(null);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not revoke the shares');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="contact-sharing-title"
      className="space-y-2 rounded-md border border-border px-3 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="contact-sharing-title" className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
            Sharing
            {sharing?.locked && <Badge variant="destructive">Locked</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">
            {on
              ? `${count} item${count === 1 ? '' : 's'} shared. ${lastUsedLine(sharing!, formatDateTime)}.`
              : 'Off. Turn it on to share single items with this contact, opened with their own code.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {on && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || count === 0}
              onClick={() => setConfirm('revoke-all')}
            >
              Revoke all
            </Button>
          )}
          <Switch
            checked={on}
            disabled={busy}
            aria-label="Enable sharing"
            onCheckedChange={(v) => (v ? void run('enable') : setConfirm('disable'))}
          />
        </div>
      </div>
      {on && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run('regenerate')}
          >
            <RefreshCw />
            Regenerate code
          </Button>
          {sharing?.locked && (
            <p className="text-xs text-destructive-ink">
              Locked after too many wrong codes. Regenerate to unlock, and send the new code.
            </p>
          )}
        </div>
      )}

      <ContactCodeDialog name={name} code={code} onClose={() => setCode(null)} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'disable' ? 'Turn sharing off?' : 'Revoke everything shared?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'disable' ? disableSharingLine(name, count) : revokeAllLine(name, count)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void (confirm === 'disable' ? run('disable') : revokeAll());
              }}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {confirm === 'disable' ? 'Turn sharing off' : `Revoke ${count}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * The code, once: large monospace with Copy. The brain keeps only a hash, so
 * a stray click must not lose it: the dialog closes only by Done, or by Copy
 * once the code is on the clipboard (no corner X, no Escape, no click
 * outside). A copy the browser refuses leaves it open, to copy by hand.
 */
function ContactCodeDialog({
  name,
  code,
  onClose,
}: {
  name: string;
  code: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const copy = async () => {
    if (code && (await copyText(code))) {
      toast.success('Code copied');
      onClose();
    } else {
      toast.error('Could not copy to clipboard. Select the code and copy it.');
    }
  };
  return (
    <Dialog open={!!code}>
      <DialogContent
        className="sm:max-w-md"
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Code for {name}</DialogTitle>
          <DialogDescription>
            {name} types this code the first time they open a link you share with them.
          </DialogDescription>
        </DialogHeader>
        <p
          className="select-all rounded-md border border-border bg-muted/40 py-4 text-center font-mono text-3xl tracking-[0.3em]"
          aria-label="Sharing code"
        >
          {code}
        </p>
        <p className="text-xs text-muted-foreground">{CODE_SHOWN_ONCE}</p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => void copy()}>
            <Copy />
            Copy
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContactSharedTab({ contactId, name }: { contactId: string; name: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ContactShareRow | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useInfiniteQuery({
    queryKey: contactSharesKey(contactId),
    queryFn: ({ pageParam }) => fetchContactShares(contactId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = query.data?.pages.flatMap((p) => p.shares) ?? [];

  const revoke = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await revokeShareLink(target.shareId);
      toast.success(`${name} can no longer open "${target.title || 'Untitled'}"`);
      setTarget(null);
      invalidateLinkQueries(queryClient);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not revoke');
    } finally {
      setBusy(false);
    }
  };

  if (query.isPending) {
    return (
      <p className="flex items-center gap-1 px-1 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }
  if (query.isError) {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
        Could not load what is shared.
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Nothing shared with this contact.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Shared">
        {rows.map((r) => (
          <li key={r.shareId} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-5 shrink-0 text-center" aria-hidden>
              {r.icon && !r.icon.includes(':') ? r.icon : ''}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/n/${encodeURIComponent(r.nodeId)}`}
                className="block truncate font-medium hover:underline"
              >
                {r.title || 'Untitled'}
              </Link>
              <p className="text-xs text-muted-foreground">
                {kindLabel(r.kind)} · shared {formatDate(r.sharedAt)} ·{' '}
                {r.lastOpenedAt ? `last opened ${formatDate(r.lastOpenedAt)}` : 'not opened yet'}
              </p>
            </div>
            {r.canWrite && <Badge variant="secondary">Can write</Badge>}
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-destructive-ink"
              onClick={() => setTarget(r)}
              aria-label={`Revoke "${r.title || 'Untitled'}"`}
            >
              <Link2Off />
            </Button>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
            Show more
          </Button>
        </div>
      )}
      <AlertDialog open={!!target} onOpenChange={(o) => !o && !busy && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this share?</AlertDialogTitle>
            <AlertDialogDescription>
              {`${name} can no longer open "${target?.title || 'Untitled'}". The item keeps its level.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep sharing</AlertDialogCancel>
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
