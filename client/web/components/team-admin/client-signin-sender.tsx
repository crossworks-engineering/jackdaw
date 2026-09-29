'use client';

/**
 * Team admin > Clients > Sign-in codes by email (client logins C2b). A
 * client with no sign-in link can ask for a code by email, once an admin
 * picks the account the codes are mailed from here. None: codes are off,
 * and /client-signin and /login offer no code at all.
 *
 * Picking a sender keeps its sent mail out of the brain (the brain leaves
 * its sent-mail folders out of mail sync, and each code mail carries a
 * marker the sync skips), so a live code never becomes a searchable item.
 * That is a real change to the admin's mail, so it is confirmed first: the
 * brain's preview names the folders (or refuses an account it cannot keep
 * out), and choosing None, or another sender, says which folders come back
 * (audit B4). The brain caps codes per day for all clients together; once
 * reached, requests still get the same answer and nothing is sent, and the
 * card says so. It also shows what was delivered, what failed (and the last
 * failure), what a limit skipped, and when no email worker runs on this box
 * (codes are then off whatever the sender, audit B3). A brain before C2b
 * answers 404 here: the card is left out.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck, TriangleAlert } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
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
import { Button } from '@mantle/web-ui/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@mantle/web-ui/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
// Relative, not '@/': the node test runner renders this
// (client-signin-sender.test.ts).
import {
  CLIENT_SENDER_KEY,
  CLIENT_SENDER_PATH,
  EMAIL_WORKER_OFF_TEXT,
  NO_SENDER,
  capReachedText,
  codesWorkerOff,
  isMissingPreviewRoute,
  lastFailureText,
  senderBody,
  senderChangeConfirm,
  senderChangedText,
  senderErrorText,
  senderPreviewOutcome,
  senderPreviewPath,
  senderStateText,
  sentCountText,
  type SenderChange,
} from '../../lib/client-signin-sender';
import type { ClientSigninSender, ClientSigninSenderPreview } from '../../lib/contract-next';

/** The card: owns the query and the change; the markup is the view. */
export function ClientSigninSenderPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: CLIENT_SENDER_KEY,
    queryFn: () => apiFetch<ClientSigninSender>(CLIENT_SENDER_PATH),
    // Another admin may have changed it, and the daily count moves.
    refetchOnMount: 'always',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [change, setChange] = useState<SenderChange | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
    const status = e instanceof ApiError ? e.status : 0;
    setError(senderErrorText(status, e instanceof ApiError ? e.body : undefined));
    // The list may have changed under the admin (an account removed).
    void q.refetch();
  };

  /** A pick in the select: nothing changes until the admin confirms. */
  const ask = async (value: string) => {
    const data = q.data;
    if (!data || value === (data.sender?.id ?? NO_SENDER)) return;
    setError(undefined);
    const restored = data.sentFoldersExcluded;
    if (value === NO_SENDER) {
      setChange({ kind: 'none', restored });
      return;
    }
    const address = data.candidates.find((c) => c.id === value)?.address ?? 'this account';
    setSaving(true);
    try {
      const preview = await apiFetch<ClientSigninSenderPreview>(senderPreviewPath(value));
      const outcome = senderPreviewOutcome(preview);
      if (outcome.kind === 'refused') {
        setError(outcome.message);
        return;
      }
      setChange({ kind: 'pick', accountId: value, address, folders: outcome.folders, restored });
    } catch (e) {
      // A brain before the preview route (a 404 naming no reason): confirm
      // without the folder names. A 404 with a reason is the account gone.
      if (isMissingPreviewRoute(e)) {
        setChange({ kind: 'pick', accountId: value, address, folders: null, restored });
      } else {
        fail(e);
      }
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!change) return;
    setSaving(true);
    setError(undefined);
    try {
      const next = await apiSend<ClientSigninSender>(
        CLIENT_SENDER_PATH,
        'PUT',
        senderBody(change.kind === 'none' ? NO_SENDER : change.accountId),
      );
      queryClient.setQueryData(CLIENT_SENDER_KEY, next);
      toast.success(senderChangedText(next, change.restored));
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
      setChange(null);
    }
  };

  if (q.isPending) return null;
  if (q.isError) {
    // A brain before C2b has no such route: nothing to offer.
    if (q.error instanceof ApiError && q.error.status === 404) return null;
    return (
      <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Couldn&apos;t load the sign-in code settings.
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </section>
    );
  }
  const confirm = change ? senderChangeConfirm(change) : null;
  return (
    <>
      <ClientSigninSenderView
        data={q.data}
        saving={saving}
        error={error}
        onChange={(v) => void ask(v)}
      />
      <AlertDialog open={!!change} onOpenChange={(o) => !saving && !o && setChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The card as markup: no state and no requests (the tests render it). */
export function ClientSigninSenderView({
  data,
  saving = false,
  error,
  onChange,
}: {
  data: ClientSigninSender;
  saving?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const value = data.sender?.id ?? NO_SENDER;
  // The sender stays listed even if it can no longer send (the brain names
  // it until changed), so the select always shows what is set.
  const options = data.sender
    ? [data.sender, ...data.candidates.filter((c) => c.id !== data.sender!.id)]
    : data.candidates;
  const label = data.sender ? data.sender.address : 'None (codes off)';
  const failure = lastFailureText(data, formatDateTime);
  return (
    <section
      className="rounded-lg border border-border bg-card text-card-foreground"
      aria-labelledby="client-codes-title"
    >
      <div className="border-b border-border p-4">
        <h2 id="client-codes-title" className="flex items-center gap-2 text-sm font-semibold">
          <MailCheck className="size-4 text-muted-foreground" aria-hidden />
          Sign-in codes by email
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A client without a sign-in link can ask for a code by email and sign in with it. Pick the
          account the codes are sent from.
        </p>
      </div>
      <div className="space-y-3 p-4">
        {codesWorkerOff(data) ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink"
            data-testid="client-codes-worker-off"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {EMAIL_WORKER_OFF_TEXT}
          </p>
        ) : null}
        {data.capReached ? (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink"
            data-testid="client-codes-cap"
          >
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {capReachedText(data.dailyCap)}
          </p>
        ) : null}
        <FieldGroup>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="client-codes-sender">Send codes from</FieldLabel>
            <Select value={value} onValueChange={onChange} disabled={saving}>
              <SelectTrigger
                id="client-codes-sender"
                className="sm:max-w-sm"
                aria-invalid={!!error || undefined}
                aria-describedby={
                  error
                    ? 'client-codes-sender-error client-codes-sender-hint'
                    : 'client-codes-sender-hint'
                }
              >
                <SelectValue>{label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SENDER}>None (codes off)</SelectItem>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="client-codes-sender-hint">
              {senderStateText(data)}
              {options.length === 0 ? (
                <>
                  {' '}
                  No account here can send yet: add one with IMAP and SMTP in{' '}
                  <Link href="/settings/accounts" className="text-primary-ink underline">
                    Email accounts
                  </Link>
                  .
                </>
              ) : null}
            </FieldDescription>
            <FieldError id="client-codes-sender-error">{error}</FieldError>
          </Field>
        </FieldGroup>
        <p className="text-xs text-muted-foreground" data-testid="client-codes-count">
          {sentCountText(data)}
        </p>
        {failure ? (
          <p className="text-xs text-destructive-ink" data-testid="client-codes-last-failure">
            {failure}
          </p>
        ) : null}
      </div>
    </section>
  );
}
