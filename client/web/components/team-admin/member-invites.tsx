'use client';

/**
 * Member invites in Settings > Logins (member logins, Phase 6; moved out of
 * Team admin 2026-10-09). The admin clicks Invite beside Add login, copies
 * the link the brain answers with and hands it over; the person opens
 * /invite, sets a password and is a member login. Nobody hands a password
 * around. Open invites are a section above the logins; one opens in the
 * detail pane with Revoke and New link.
 *
 * The code and link are in the create answer ONCE (the brain keeps only the
 * hash), so the dialog shows them there and then. A new invite for the same
 * contact or email replaces the old one. Server: /api/team-admin/invites
 * (docs/member-logins.md §9 in the mantle repo).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, X } from 'lucide-react';
import type {
  MemberInviteCreated,
  MemberInviteList,
  MemberInviteRow,
  MemberInviteState,
} from '@mantle/client-types';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { CopyButton } from '@mantle/web-ui/ui/copy-button';
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
import {
  INVITE_LIFETIME_HOURS,
  inviteCreateErrorText,
  inviteLink,
  inviteName,
} from '@/lib/member-invites';
import { HeaderIconButton, HeaderInfoButton, ItemHeader } from '@/components/layout/item-header';
import { TeamAgentNotice } from '@/components/team-admin/team-agent-access';
import type { TeamAgentAccess } from '@/lib/team-agent-access';

export const INVITES_KEY = ['team-admin', 'invites'] as const;

/** The brain's invites, newest first. Shared by the Logins list and the
 *  invite pane, so a create or revoke refreshes both. */
export function useMemberInvites() {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: () => apiFetch<MemberInviteList>('/api/team-admin/invites'),
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Refusals about the email (shown under the email field); the rest are about
 *  the contact and shown under the form. */
const EMAIL_REASONS = new Set(['email-has-login', 'no-email']);

/**
 * Create an invite: for a contact (`contact` set; the email and name default
 * to the contact's) or for an email. On success the dialog turns into the
 * link, the code and a Copy button.
 */
export function InviteDialog({
  open,
  onOpenChange,
  contact,
  initialEmail = '',
  initialName = '',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: { id: string; name: string };
  /** A new link for an email invite: the form starts filled in. */
  initialEmail?: string;
  initialName?: string;
  /** The new invite's id, once made (to select it). */
  onCreated?: (inviteId: string) => void;
}) {
  const queryClient = useQueryClient();
  const invites = useMemberInvites();
  // An invited member cannot chat until the team agent is at Team level: the
  // form says so (Team admin > Settings holds the switch).
  const settings = useQuery({
    queryKey: ['team-admin', 'settings'],
    queryFn: () => apiFetch<{ teamAgent?: TeamAgentAccess | null }>('/api/team-admin/settings'),
    enabled: open,
  });
  const [email, setEmail] = useState(initialEmail);
  const [displayName, setDisplayName] = useState(initialName);
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<MemberInviteCreated | null>(null);

  const replaces = contact
    ? invites.data?.invites.some((i) => i.state === 'open' && i.contactId === contact.id)
    : false;

  const reset = () => {
    setEmail(initialEmail);
    setDisplayName(initialName);
    setEmailError(undefined);
    setFormError(undefined);
    setCreated(null);
  };
  const changeOpen = (o: boolean) => {
    if (pending) return;
    if (!o) reset();
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    // A contact invite may leave the email blank (the contact's is used).
    const err = !trimmed
      ? contact
        ? undefined
        : 'Enter the email the invite is for.'
      : EMAIL_RE.test(trimmed)
        ? undefined
        : 'That does not look like an email address.';
    setEmailError(err);
    setFormError(undefined);
    if (err) {
      document.getElementById('invite-email')?.focus();
      return;
    }
    setPending(true);
    try {
      const res = await apiSend<MemberInviteCreated>('/api/team-admin/invites', 'POST', {
        ...(contact ? { contactId: contact.id } : {}),
        ...(trimmed ? { email: trimmed } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setCreated(res);
      void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      onCreated?.(res.invite.id);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const body = e instanceof ApiError ? e.body : undefined;
      const text = inviteCreateErrorText(status, body);
      if (EMAIL_REASONS.has(String(body?.reason)) || (status === 400 && !body?.reason)) {
        setEmailError(text);
        document.getElementById('invite-email')?.focus();
      } else {
        setFormError(text);
      }
    } finally {
      setPending(false);
    }
  };

  const who = created
    ? created.invite.displayName || created.invite.contactName || created.invite.email
    : (contact?.name ?? null);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite ready</DialogTitle>
              <DialogDescription>
                Send {who} this link. They set their own password and are signed in as a member.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-link">Invite link</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="invite-link"
                    readOnly
                    value={inviteLink(window.location.origin, created.linkPath)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-describedby="invite-link-hint"
                  />
                  <CopyButton
                    value={inviteLink(window.location.origin, created.linkPath)}
                    className="h-9 shrink-0 gap-1.5 px-3 text-sm"
                    ariaLabel="Copy the invite link"
                  />
                </div>
                <FieldDescription id="invite-link-hint">
                  For {created.invite.email}. It works once and expires in {INVITE_LIFETIME_HOURS}{' '}
                  hours, on {formatDateTime(created.invite.expiresAt)}.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-code">Code</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="invite-code"
                    readOnly
                    value={created.code}
                    className="font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                    aria-describedby="invite-code-hint"
                  />
                  <CopyButton
                    value={created.code}
                    className="h-9 shrink-0 gap-1.5 px-3 text-sm"
                    ariaLabel="Copy the code"
                  />
                </div>
                <FieldDescription id="invite-code-hint">
                  They can type it at /invite instead of opening the link. This is the only time the
                  code is shown; a new invite for them replaces this one.
                </FieldDescription>
              </Field>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" onClick={() => changeOpen(false)}>
                  Done
                </Button>
              </div>
            </FieldGroup>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {contact ? `Invite ${contact.name} as a member` : 'Invite by email'}
              </DialogTitle>
              <DialogDescription>
                You get a link to hand over. It works once and expires in {INVITE_LIFETIME_HOURS}{' '}
                hours. Nothing is emailed.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} noValidate>
              <FieldGroup>
                <TeamAgentNotice agent={settings.data?.teamAgent} />
                <Field data-invalid={!!emailError || undefined}>
                  <FieldLabel htmlFor="invite-email">
                    {contact ? 'Email (optional)' : 'Email'}
                  </FieldLabel>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="off"
                    aria-invalid={!!emailError || undefined}
                    aria-describedby={
                      emailError ? 'invite-email-error invite-email-hint' : 'invite-email-hint'
                    }
                  />
                  <FieldDescription id="invite-email-hint">
                    {contact
                      ? 'Leave blank to use the contact’s email. It becomes their login.'
                      : 'It becomes their login.'}
                  </FieldDescription>
                  <FieldError id="invite-email-error">{emailError}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="invite-name">Name (optional)</FieldLabel>
                  <Input
                    id="invite-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={contact?.name ?? 'Their full name'}
                    aria-describedby="invite-name-hint"
                  />
                  <FieldDescription id="invite-name-hint">
                    {contact ? 'Defaults to the contact’s name.' : 'How they appear in the app.'}
                  </FieldDescription>
                </Field>
                {replaces && (
                  <p className="text-xs text-muted-foreground">
                    {contact?.name} has an open invite. A new one replaces it: the old link stops
                    working.
                  </p>
                )}
                <FieldError id="invite-form-error">{formError}</FieldError>
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                    Cancel
                  </Button>
                  <SubmitButton pending={pending}>Create invite</SubmitButton>
                </div>
              </FieldGroup>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATE_LABEL: Record<MemberInviteState, string> = {
  open: 'Open',
  redeemed: 'Accepted',
  expired: 'Expired',
};

function StatePill({ state }: { state: MemberInviteState }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        state === 'open' && 'bg-primary text-primary-foreground',
        state === 'redeemed' && 'bg-success/15 text-success-ink',
        state === 'expired' && 'bg-muted text-muted-foreground',
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export function stateLine(i: MemberInviteRow): string {
  if (i.state === 'redeemed') return `Accepted ${formatDateTime(i.redeemedAt)}`;
  if (i.state === 'expired') return `Expired ${formatDateTime(i.expiresAt)}`;
  return `Expires ${formatDateTime(i.expiresAt)}`;
}

/**
 * One open invite in the Logins detail pane: the one header (its name and
 * state; New link; Info and Revoke as icons), then what it is for. The link
 * itself was shown once, when it was made: New link makes another and the
 * old one stops working.
 */
export function InviteDetail({
  invite,
  onRevoked,
  onCreated,
}: {
  invite: MemberInviteRow;
  onRevoked: () => void;
  onCreated: (inviteId: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [again, setAgain] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/team-admin/invites/${encodeURIComponent(invite.id)}`, 'DELETE');
      toast.success('Invite revoked');
      onRevoked();
    } catch (e) {
      toast.error(
        e instanceof ApiError && e.status === 404
          ? 'That invite is already used or gone.'
          : 'Could not revoke the invite',
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      setBusy(false);
      setRevoking(false);
    }
  };

  const contact =
    invite.contactId && invite.contactName
      ? { id: invite.contactId, name: invite.contactName }
      : undefined;
  return (
    <div>
      <ItemHeader
        sticky
        visual={<MailPlus className="size-4 text-muted-foreground" aria-hidden />}
        title={inviteName(invite)}
        badges={<StatePill state={invite.state} />}
        textActions={
          <Button size="sm" variant="outline" onClick={() => setAgain(true)}>
            New link
          </Button>
        }
        iconActions={
          <>
            <HeaderInfoButton label="About this invite">
              <p>
                An invite link makes a member login: the person opens it and sets their own
                password. It works once, for {INVITE_LIFETIME_HOURS} hours.
              </p>
              <p className="text-muted-foreground">
                The link is shown once, when it is made. To send it again, click New link: the old
                link stops working.
              </p>
            </HeaderInfoButton>
            <HeaderIconButton
              label="Revoke invite"
              tooltip="Revoke: the link stops working now"
              className="text-muted-foreground hover:text-destructive-ink"
              onClick={() => setRevoking(true)}
            >
              <X />
            </HeaderIconButton>
          </>
        }
      />
      <div className="grid gap-x-8 gap-y-2 p-6 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Email</div>
          <div className="mt-0.5 break-all">{invite.email}</div>
        </div>
        {invite.contactName ? (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Contact</div>
            <div className="mt-0.5">{invite.contactName}</div>
          </div>
        ) : null}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Made</div>
          <div className="mt-0.5">{formatDateTime(invite.createdAt)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">State</div>
          <div className="mt-0.5">{stateLine(invite)}</div>
        </div>
      </div>

      <InviteDialog
        open={again}
        onOpenChange={setAgain}
        contact={contact}
        initialEmail={contact ? '' : invite.email}
        initialName={contact ? '' : (invite.displayName ?? '')}
        onCreated={onCreated}
      />
      <AlertDialog open={revoking} onOpenChange={(o) => !busy && !o && setRevoking(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke the invite for {invite.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              The link and code stop working now. You can invite them again later.
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
    </div>
  );
}
