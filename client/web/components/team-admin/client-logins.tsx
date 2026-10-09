'use client';

/**
 * Clients in Settings > Logins (client logins C2; moved out of Team admin
 * 2026-10-09). An admin adds a CLIENT login (an email, or a contact), issues
 * it a sign-in link and hands the link over; the client opens it, types their
 * email and is signed in for 30 days. A client has no password, so a link is
 * the only way in: one use, 72 hours, and a new one revokes the old.
 *
 * The client logins are rows in the Logins list (its Clients section, after
 * the two client steps: What clients see, then Client settings). This file
 * holds what is client-only on that screen: Add client, a client login's
 * Sign-in link card, and the Client settings pane (Sign-in codes by email
 * (C2b), Chat use today (C4), the clients' storage).
 *
 * Add client and Issue sign-in link stay disabled until "What clients see"
 * is checked (the brain refuses both until then: every client login reads
 * every client-level item). The code and link are in the issue answer ONCE,
 * so the dialog shows them there and then. End sessions, Disable and Delete
 * are the login's own (Sign out everywhere, Disabled, Delete), as for any
 * login. Brain routes unchanged: /api/team-admin/clients[/:id/signin-link].
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { copyText } from '@mantle/web-ui/lib/secure-context-fallbacks';
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@mantle/web-ui/ui/field';
import { Input } from '@mantle/web-ui/ui/input';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { cn } from '@mantle/web-ui/lib/utils';
// Relative, not '@/': the node test runner renders this (client-logins.test.ts).
import {
  CLIENT_ACTIONS_BLOCKED_TEXT,
  CLIENT_LINK_LIFETIME_HOURS,
  CLIENT_LOGINS_KEY,
  clientActionConfirm,
  clientActionsBlocked,
  clientCreateErrorText,
  clientLinkErrorText,
  clientName,
  clientSigninUrl,
  openLinkAt,
} from '../../lib/client-logins';
import { clientEmailError } from '../../lib/client-portal';
import type {
  ClientLoginCreated,
  ClientLoginList,
  ClientLoginRow,
  ClientSigninLinkCreated,
} from '@mantle/client-types';
import { ClientChatUsagePanel } from './client-chat-usage';
import { ClientStoragePanel } from './client-storage';
import { ClientSigninSenderPanel } from './client-signin-sender';
import { ContactPicker, type PickedContact } from './contact-picker';

export function useClientLogins() {
  return useQuery({
    queryKey: CLIENT_LOGINS_KEY,
    queryFn: () => apiFetch<ClientLoginList>('/api/team-admin/clients'),
    // Whether the report is acknowledged can change on another screen (or in
    // another browser): ask again each time the screen opens.
    refetchOnMount: 'always',
  });
}

/** A sign-in link action, confirmed first: a new link while one is open
 *  (it revokes the open one), or Revoke. */
type LinkAction =
  { kind: 'reissue'; row: ClientLoginRow } | { kind: 'revoke'; row: ClientLoginRow };

/**
 * A client login's Sign-in link card, in its Logins detail: whether a link
 * is open, Issue sign-in link and Revoke. Owns the requests and the dialogs;
 * the card itself is ClientSigninView (rendered by the tests). `onShowReport`
 * opens What clients see, which the actions wait for.
 */
export function ClientSigninCard({
  loginId,
  onShowReport,
}: {
  loginId: string;
  onShowReport: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = useClientLogins();
  const [issued, setIssued] = useState<{
    row: ClientLoginRow;
    link: ClientSigninLinkCreated;
  } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [action, setAction] = useState<LinkAction | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: CLIENT_LOGINS_KEY });

  const issue = async (row: ClientLoginRow) => {
    setIssuing(true);
    try {
      const link = await apiSend<ClientSigninLinkCreated>(
        `/api/team-admin/clients/${encodeURIComponent(row.id)}/signin-link`,
        'POST',
      );
      setIssued({ row, link });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      const status = e instanceof ApiError ? e.status : 0;
      toast.error(clientLinkErrorText(status, e instanceof ApiError ? e.body : undefined));
    } finally {
      setIssuing(false);
      void refresh();
    }
  };

  // A new link revokes the open one: confirmed first when one is open.
  const askIssue = (row: ClientLoginRow) => {
    if (openLinkAt(row, Date.now())) setAction({ kind: 'reissue', row });
    else void issue(row);
  };

  const run = async () => {
    if (!action) return;
    if (action.kind === 'reissue') {
      setAction(null);
      await issue(action.row);
      return;
    }
    setBusy(true);
    try {
      await apiSend(
        `/api/team-admin/clients/${encodeURIComponent(action.row.id)}/signin-link`,
        'DELETE',
      );
      toast.success('Sign-in link revoked');
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(
          e instanceof ApiError && e.status === 404
            ? 'That link is already used, expired or gone.'
            : 'Could not do that. Try again.',
        );
      }
    } finally {
      await refresh();
      setBusy(false);
      setAction(null);
    }
  };

  const row = q.data?.clients.find((c) => c.id === loginId) ?? null;
  const confirm = action
    ? clientActionConfirm(
        action.kind,
        action.row,
        action.kind === 'reissue' && action.row.openLink
          ? formatDateTime(action.row.openLink.expiresAt)
          : undefined,
      )
    : null;

  return (
    <>
      {q.isPending ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Loading the sign-in link…
        </p>
      ) : q.isError ? (
        <div className="flex items-center gap-3 rounded-md border border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load the sign-in link.
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : row ? (
        <ClientSigninView
          row={row}
          now={Date.now()}
          blocked={clientActionsBlocked(q.data)}
          issuing={issuing}
          onIssue={askIssue}
          onRevoke={(r) => setAction({ kind: 'revoke', row: r })}
          onShowReport={onShowReport}
        />
      ) : null}

      <SigninLinkDialog issued={issued} onClose={() => setIssued(null)} />
      <AlertDialog open={!!action} onOpenChange={(o) => !busy && !o && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run();
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

/** The card itself: no state, no requests (the tests render it). */
export function ClientSigninView({
  row,
  now,
  blocked,
  issuing = false,
  onIssue,
  onRevoke,
  onShowReport,
}: {
  row: ClientLoginRow;
  now: number;
  blocked: boolean;
  issuing?: boolean;
  onIssue: (row: ClientLoginRow) => void;
  onRevoke: (row: ClientLoginRow) => void;
  onShowReport: () => void;
}) {
  const name = clientName(row);
  const link = openLinkAt(row, now);
  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-muted-foreground" /> Sign-in link
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A client has no password: they sign in with a link you issue here. It works once, for{' '}
          {CLIENT_LINK_LIFETIME_HOURS} hours, and a new link replaces the old one.
        </p>
      </div>
      <div className="space-y-0.5">
        <p className={cn('text-sm', link ? 'text-foreground' : 'text-muted-foreground')}>
          {link
            ? `Sign-in link open until ${formatDateTime(link.expiresAt)}`
            : 'No open sign-in link'}
        </p>
        <p className="text-xs text-muted-foreground">
          Last sign-in {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'never'} · Link last
          used {row.lastLinkUsedAt ? formatDateTime(row.lastLinkUsedAt) : 'never'}
        </p>
      </div>
      {row.disabled ? (
        <p className="text-xs text-muted-foreground">
          This login is disabled: switch Disabled off to issue a link.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={blocked || issuing}
            onClick={() => onIssue(row)}
            aria-label={`Issue a sign-in link for ${name}`}
          >
            <KeyRound />
            Issue sign-in link
          </Button>
          {link ? (
            <Button variant="ghost" size="sm" onClick={() => onRevoke(row)}>
              Revoke link
            </Button>
          ) : null}
        </div>
      )}
      {blocked && !row.disabled ? <BlockedNote onShowReport={onShowReport} /> : null}
    </div>
  );
}

/** Why Add client and Issue sign-in link are disabled, with the way to the
 *  first client step. */
export function BlockedNote({ onShowReport }: { onShowReport: () => void }) {
  return (
    <p className="text-xs text-muted-foreground">
      {CLIENT_ACTIONS_BLOCKED_TEXT}{' '}
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-xs underline"
        onClick={onShowReport}
      >
        What clients see
      </Button>
    </p>
  );
}

/** The Client settings step: how clients get a code by email, their chat
 *  use today and their storage. Each card hides itself on a brain without
 *  its route. */
export function ClientSettingsPanel() {
  const q = useClientLogins();
  return (
    <div className="w-full space-y-4 p-4">
      <ClientSigninSenderPanel />
      {q.data ? <ClientChatUsagePanel clients={q.data.clients} /> : null}
      {/* Always: a deleted client's space still counts until it is purged. */}
      <ClientStoragePanel />
    </div>
  );
}

/**
 * The link, once: the full URL with Copy. The brain keeps only a hash, so a
 * stray click must not lose it: the dialog closes only by Done, or by Copy
 * once the link is on the clipboard (no corner X, no Escape, no click
 * outside). A copy the browser refuses leaves it open, to select by hand.
 */
function SigninLinkDialog({
  issued,
  onClose,
}: {
  issued: { row: ClientLoginRow; link: ClientSigninLinkCreated } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const url = issued ? clientSigninUrl(window.location.origin, issued.link.path) : '';
  const copy = async () => {
    if (await copyText(url)) {
      toast.success('Sign-in link copied');
      onClose();
    } else {
      toast.error('Could not copy to clipboard. Select the link and copy it.');
    }
  };
  return (
    <Dialog open={!!issued}>
      <DialogContent
        className="sm:max-w-md"
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sign-in link ready</DialogTitle>
          <DialogDescription>
            Send {issued ? clientName(issued.row) : 'them'} this link. They open it and type their
            email to sign in.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="client-link">Sign-in link</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="client-link"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-describedby="client-link-hint"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                aria-label="Copy the sign-in link"
                onClick={() => void copy()}
              >
                <Copy />
                Copy
              </Button>
            </div>
            <FieldDescription id="client-link-hint">
              For {issued?.row.email}. It works once and expires in {CLIENT_LINK_LIFETIME_HOURS}{' '}
              hours
              {issued ? `, on ${formatDateTime(issued.link.link.expiresAt)}` : ''}. This is the only
              time it is shown; a new link replaces it.
            </FieldDescription>
          </Field>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

/** Add a client login: for an email, or for a contact (whose email and name
 *  it takes unless given). The login signs in with a link issued after. */
export function AddClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The new client login's id, to select it. */
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const reset = () => {
    setEmail('');
    setDisplayName('');
    setContact(null);
    setEmailError(undefined);
    setFormError(undefined);
  };
  const changeOpen = (o: boolean) => {
    if (pending) return;
    if (!o) reset();
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    // A contact may leave the email blank (the contact's is used).
    const err = !trimmed && contact ? null : clientEmailError(trimmed);
    setEmailError(err ?? undefined);
    setFormError(undefined);
    if (err) {
      document.getElementById('client-add-email')?.focus();
      return;
    }
    setPending(true);
    try {
      const res = await apiSend<ClientLoginCreated>('/api/team-admin/clients', 'POST', {
        ...(contact ? { contactId: contact.id } : {}),
        ...(trimmed ? { email: trimmed } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      toast.success(`Added ${clientName(res.client)}. Issue a sign-in link to let them in.`);
      onCreated(res.client.id);
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      const status = e instanceof ApiError ? e.status : 0;
      const body = e instanceof ApiError ? e.body : undefined;
      const text = clientCreateErrorText(status, body);
      if (
        body?.reason === 'email-has-login' ||
        body?.reason === 'no-email' ||
        body?.reason === 'email-not-on-contact'
      ) {
        setEmailError(text);
        document.getElementById('client-add-email')?.focus();
      } else {
        setFormError(text);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            A client login for someone at your client. It reads Client-level items only. Once it
            exists, issue it a sign-in link.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-add-contact">Contact (optional)</FieldLabel>
              <ContactPicker
                id="client-add-contact"
                hintId="client-add-contact-hint"
                enabled={open}
                contact={contact}
                onChange={setContact}
              />
              <FieldDescription id="client-add-contact-hint">
                Pick a contact to use their email and name, or leave it and enter an email.
              </FieldDescription>
            </Field>
            <Field data-invalid={!!emailError || undefined}>
              <FieldLabel htmlFor="client-add-email">
                {contact ? 'Email (optional)' : 'Email'}
              </FieldLabel>
              <Input
                id="client-add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="off"
                aria-invalid={!!emailError || undefined}
                aria-describedby={
                  emailError
                    ? 'client-add-email-error client-add-email-hint'
                    : 'client-add-email-hint'
                }
              />
              <FieldDescription id="client-add-email-hint">
                {contact ? 'Leave blank to use the contact’s email.' : 'They sign in with it.'}
              </FieldDescription>
              <FieldError id="client-add-email-error">{emailError}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="client-add-name">Name (optional)</FieldLabel>
              <Input
                id="client-add-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={contact ? contact.name : 'Their full name'}
              />
            </Field>
            <FieldError id="client-add-error">{formError}</FieldError>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pending={pending}>Add client</SubmitButton>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
