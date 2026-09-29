'use client';

/**
 * Team admin > Clients (client logins C2). An admin adds a CLIENT login (an
 * email, or a contact), issues it a sign-in link and hands the link over;
 * the client opens it, types their email and is signed in for 30 days. A
 * client has no password, so a link is the only way in: one use, 72 hours,
 * and a new one revokes the old.
 *
 * Below the list, Sign-in codes by email (C2b): the account codes are
 * mailed from, for a client with no link.
 *
 * Add client and Issue sign-in link stay disabled until "What clients see"
 * is checked (the brain refuses both until then: every client login reads
 * every client-level item). The code and link are in the issue answer ONCE,
 * so the dialog shows them there and then. End sessions, Disable and Delete
 * are the users routes (as Settings > Logins calls them).
 */
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, MoreHorizontal, UserPlus } from 'lucide-react';
import type { ContactRow } from '@mantle/content-core/contacts-format';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@mantle/web-ui/ui/field';
import { Input } from '@mantle/web-ui/ui/input';
import { RowButton } from '@mantle/web-ui/ui/row-button';
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
import { signLoginOutEverywhere } from '../../lib/sign-out-everywhere';
import { ClientSigninSenderPanel } from './client-signin-sender';

function useClientLogins() {
  return useQuery({
    queryKey: CLIENT_LOGINS_KEY,
    queryFn: () => apiFetch<ClientLoginList>('/api/team-admin/clients'),
    // Whether the report is acknowledged can change on another tab (or in
    // another browser): ask again each time the tab opens.
    refetchOnMount: 'always',
  });
}

/** An action on one row, confirmed first where it cannot be undone. */
type RowAction =
  | { kind: 'reissue'; row: ClientLoginRow }
  | { kind: 'revoke'; row: ClientLoginRow }
  | { kind: 'end'; row: ClientLoginRow }
  | { kind: 'disable'; row: ClientLoginRow }
  | { kind: 'delete'; row: ClientLoginRow };

export type ClientRowHandlers = {
  onIssue: (row: ClientLoginRow) => void;
  onAction: (action: RowAction) => void;
  onEnable: (row: ClientLoginRow) => void;
};

/**
 * The Clients tab: the list, Add client, and each row's sign-in link and
 * login actions. Owns the query, the requests and the dialogs; the list
 * itself is ClientLoginsView (rendered by the tests).
 */
export function ClientLoginsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const q = useClientLogins();
  const [addOpen, setAddOpen] = useState(false);
  const [issued, setIssued] = useState<{
    row: ClientLoginRow;
    link: ClientSigninLinkCreated;
  } | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [action, setAction] = useState<RowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: CLIENT_LOGINS_KEY });

  const issue = async (row: ClientLoginRow) => {
    setIssuing(row.id);
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
      setIssuing(null);
      void refresh();
    }
  };

  const setDisabled = async (row: ClientLoginRow, disabled: boolean) => {
    await apiSend(`/api/users/${encodeURIComponent(row.id)}`, 'PATCH', { disabled });
    toast.success(disabled ? 'Client login disabled' : 'Client login enabled');
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
    const { row } = action;
    try {
      if (action.kind === 'revoke') {
        await apiSend(
          `/api/team-admin/clients/${encodeURIComponent(row.id)}/signin-link`,
          'DELETE',
        );
        toast.success('Sign-in link revoked');
      } else if (action.kind === 'end') {
        const outcome = await signLoginOutEverywhere(row.id);
        if (outcome.kind === 'error') throw new Error(outcome.message);
        toast.success(`Signed ${clientName(row)} out everywhere`);
      } else if (action.kind === 'disable') {
        await setDisabled(row, true);
      } else {
        await apiSend(`/api/users/${encodeURIComponent(row.id)}`, 'DELETE');
        toast.success('Client login deleted');
      }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(
          action.kind === 'revoke' && e instanceof ApiError && e.status === 404
            ? 'That link is already used, expired or gone.'
            : e instanceof Error && e.message
              ? e.message
              : 'Could not do that. Try again.',
        );
      }
    } finally {
      await refresh();
      setBusy(false);
      setAction(null);
    }
  };

  const enable = async (row: ClientLoginRow) => {
    try {
      await setDisabled(row, false);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        toast.error(e instanceof Error && e.message ? e.message : 'Could not enable the login');
      }
    } finally {
      void refresh();
    }
  };

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
    <div className="w-full space-y-4 p-4">
      {q.isPending ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          Couldn&apos;t load client logins.
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <ClientLoginsView
          list={q.data}
          now={Date.now()}
          issuing={issuing}
          onAdd={() => setAddOpen(true)}
          onIssue={askIssue}
          onAction={setAction}
          onEnable={(row) => void enable(row)}
        />
      )}
      <ClientSigninSenderPanel />

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => void refresh()} />
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
    </div>
  );
}

/** The list itself: no state, no requests (the tests render it). */
export function ClientLoginsView({
  list,
  now,
  issuing = null,
  onAdd,
  onIssue,
  onAction,
  onEnable,
}: {
  list: ClientLoginList;
  now: number;
  issuing?: string | null;
  onAdd: () => void;
} & ClientRowHandlers) {
  const blocked = clientActionsBlocked(list);
  return (
    <section className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Client logins</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A client reads what is at the Client level, and nothing else. They sign in with a link
            you issue here: no password.
          </p>
        </div>
        <Button size="sm" className="shrink-0" disabled={blocked} onClick={onAdd}>
          <UserPlus />
          Add client
        </Button>
      </div>
      {blocked ? (
        <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          {CLIENT_ACTIONS_BLOCKED_TEXT}{' '}
          <Link href="/team-admin?view=clients" className="text-primary-ink underline">
            What clients see
          </Link>
        </p>
      ) : null}
      {list.clients.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No client logins yet.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Client logins">
          {list.clients.map((row) => (
            <ClientRow
              key={row.id}
              row={row}
              now={now}
              blocked={blocked}
              issuing={issuing === row.id}
              onIssue={onIssue}
              onAction={onAction}
              onEnable={onEnable}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientRow({
  row,
  now,
  blocked,
  issuing,
  onIssue,
  onAction,
  onEnable,
}: {
  row: ClientLoginRow;
  now: number;
  blocked: boolean;
  issuing: boolean;
} & ClientRowHandlers) {
  const name = clientName(row);
  const link = openLinkAt(row, now);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {row.disabled ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Disabled
            </span>
          ) : null}
        </div>
        {name !== row.email ? (
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Last sign-in {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'never'} · Link last
          used {row.lastLinkUsedAt ? formatDateTime(row.lastLinkUsedAt) : 'never'}
        </p>
        <p className={cn('text-xs', link ? 'text-foreground' : 'text-muted-foreground')}>
          {link
            ? `Sign-in link open until ${formatDateTime(link.expiresAt)}`
            : 'No open sign-in link'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.disabled ? (
          <Button variant="outline" size="sm" onClick={() => onEnable(row)}>
            Enable
          </Button>
        ) : (
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
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {link ? (
              <DropdownMenuItem onSelect={() => onAction({ kind: 'revoke', row })}>
                Revoke sign-in link
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onAction({ kind: 'end', row })}>
              End sessions
            </DropdownMenuItem>
            {row.disabled ? null : (
              <DropdownMenuItem onSelect={() => onAction({ kind: 'disable', row })}>
                Disable
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive-ink focus:text-destructive-ink"
              onSelect={() => onAction({ kind: 'delete', row })}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
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

type ContactsPage = { contacts: ContactRow[] };

function contactLabel(c: ContactRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || c.email || 'Contact';
}

/** Add a client login: for an email, or for a contact (whose email and name
 *  it takes unless given). The login signs in with a link issued after. */
function AddClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const term = contactQuery.trim();
  const contacts = useQuery({
    queryKey: ['contacts', { q: term, page: 1 }],
    queryFn: () => apiFetch<ContactsPage>(`/api/contacts?q=${encodeURIComponent(term)}`),
    enabled: open && !contact && term.length >= 2,
  });

  const reset = () => {
    setEmail('');
    setDisplayName('');
    setContactQuery('');
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
      onCreated();
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

  const matches = contacts.data?.contacts.slice(0, 6) ?? [];
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
              {contact ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {contactLabel(contact)}
                    {contact.email ? (
                      <span className="text-muted-foreground"> · {contact.email}</span>
                    ) : null}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setContact(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="client-add-contact"
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    placeholder="Search contacts"
                    autoComplete="off"
                    aria-describedby="client-add-contact-hint"
                  />
                  {matches.length ? (
                    <ul className="max-h-48 overflow-y-auto rounded-md border border-border scrollbar-thin">
                      {matches.map((c) => (
                        <li key={c.id}>
                          <RowButton
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                            onClick={() => {
                              setContact(c);
                              setContactQuery('');
                            }}
                          >
                            <span className="min-w-0 truncate">{contactLabel(c)}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {c.email || 'no email'}
                            </span>
                          </RowButton>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
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
                placeholder={contact ? contactLabel(contact) : 'e.g. Sam Botha'}
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
