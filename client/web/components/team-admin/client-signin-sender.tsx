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
 * The brain caps codes per day for all clients together; once reached,
 * requests still get the same answer and nothing is sent, and the card says
 * so. A brain before C2b answers 404 here: the card is left out.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck, TriangleAlert } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
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
// Relative, not '@/': the node test runner renders this
// (client-signin-sender.test.ts).
import {
  CLIENT_SENDER_KEY,
  CLIENT_SENDER_PATH,
  NO_SENDER,
  capReachedText,
  senderBody,
  senderErrorText,
  senderStateText,
  sentCountText,
} from '../../lib/client-signin-sender';
import type { ClientSigninSender } from '../../lib/contract-next';

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

  const change = async (value: string) => {
    setSaving(true);
    setError(undefined);
    try {
      const next = await apiSend<ClientSigninSender>(CLIENT_SENDER_PATH, 'PUT', senderBody(value));
      queryClient.setQueryData(CLIENT_SENDER_KEY, next);
      toast.success(
        next.sender
          ? `Sign-in codes are sent from ${next.sender.address}`
          : 'Sign-in codes are off',
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      const status = e instanceof ApiError ? e.status : 0;
      setError(senderErrorText(status, e instanceof ApiError ? e.body : undefined));
      // The list may have changed under the admin (an account removed).
      void q.refetch();
    } finally {
      setSaving(false);
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
  return (
    <ClientSigninSenderView
      data={q.data}
      saving={saving}
      error={error}
      onChange={(v) => void change(v)}
    />
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
      </div>
    </section>
  );
}
