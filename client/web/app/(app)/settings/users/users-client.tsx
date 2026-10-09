'use client';

import { shortModelName } from '@mantle/web-ui/lib/model-name';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  canResetPassword,
  isNotAPasswordLogin,
  resetPasswordErrorMessage,
} from '@/lib/password-reset';
import {
  Anchor,
  Bot,
  Eye,
  KeyRound,
  MailPlus,
  MessagesSquare,
  Monitor,
  MonitorSmartphone,
  Plus,
  Settings2,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { ClientReport, MemberChatsResponse } from '@mantle/client-types';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { ListCard, ListCardMeta } from '@mantle/web-ui/ui/list-card';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@mantle/web-ui/ui/alert-dialog';
import { Input } from '@mantle/web-ui/ui/input';
import { Switch } from '@mantle/web-ui/ui/switch';
import { SecretInput } from '@mantle/web-ui/ui/secret-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { Field, FieldError, FieldLabel } from '@mantle/web-ui/ui/field';
import { FieldHint, hintId } from '@mantle/web-ui/ui/field-hint';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { signOutActive } from '@mantle/web-ui/session-switch';
import {
  EVERYWHERE_CONFIRM,
  otherLoginEverywhereText,
  signLoginOutEverywhere,
  signOutEverywhere,
} from '@/lib/sign-out-everywhere';
import {
  CLIENT_ACTIONS_BLOCKED_TEXT,
  CLIENT_LOGINS_KEY,
  clientActionsBlocked,
  loginDeleteText,
} from '@/lib/client-logins';
import {
  CLIENT_REPORT_KEY,
  NOT_ON_THIS_BRAIN,
  fetchClientReport,
  isReportMissing,
} from '@/lib/client-report';
import { loginHasChat, rosterIds } from '@/lib/login-chat';
import { CLIENT_SETTINGS, WHAT_CLIENTS_SEE, inviteIdOf, inviteKey } from '@/lib/logins-nav';
import { HeaderIconButton, HeaderInfoButton, ItemHeader } from '@/components/layout/item-header';
import { ReviewSections } from '@/components/review/workspace-review-sections';
import { LoginChat } from '@/components/logins/login-chat';
import {
  InviteDetail,
  InviteDialog,
  stateLine,
  useMemberInvites,
} from '@/components/team-admin/member-invites';
import { inviteName, newLinkSeed, openInvites } from '@/lib/member-invites';
import {
  AddClientDialog,
  ClientSettingsPanel,
  ClientSigninCard,
  useClientLogins,
} from '@/components/team-admin/client-logins';
import { ClientReportPanel } from '@/components/team-admin/client-report';
import { PairPhoneCard } from './pair-phone-card';

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  isOwner: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** This login's personal assistant, or null when it shares the brain default. */
  agent: { id: string; slug: string; name: string } | null;
  /** 'member' = a team member's login (users are the team): refused by every
   *  admin screen, reads team-level items at /m (member logins, Phase 1).
   *  'client' = a person at the brain's client company (client logins C2):
   *  reads client-level items only and signs in with a link. Made and managed
   *  in this screen's Clients section; the brain refuses a role change to or
   *  from it. */
  role: 'admin' | 'member' | 'client';
  contactId: string | null;
  disabledAt: string | null;
};

/** Admin or Member. Member logins are always on (Phase 6 removed the
 *  MANTLE_MEMBERS flag). A member login IS the team member: users are the
 *  team, so no contact is picked (Jason, 2026-09-26). */
function RoleFields({
  idPrefix,
  role,
  onRoleChange,
}: {
  idPrefix: string;
  role: 'admin' | 'member';
  onRoleChange: (role: 'admin' | 'member') => void;
}) {
  const roleId = `${idPrefix}-role`;
  return (
    <Field>
      <FieldLabel htmlFor={roleId}>Role</FieldLabel>
      <Select value={role} onValueChange={(v) => onRoleChange(v as 'admin' | 'member')}>
        <SelectTrigger id={roleId} aria-describedby={hintId(roleId)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin: the whole brain</SelectItem>
          <SelectItem value="member">Member: team-level items and chat only</SelectItem>
        </SelectContent>
      </Select>
      <FieldHint id={roleId}>
        {role === 'member'
          ? 'A member sees only what is set to Team (or lower), in their own space at /m. They never see admin screens.'
          : 'An admin is a full co-owner of this brain.'}
      </FieldHint>
    </Field>
  );
}

/** One option in the "copy from" picker. */
type SourceAgent = { id: string; slug: string; name: string; role: string; model: string };

/**
 * Agents a personal assistant can be copied from: the brain's ENTRY-POINT
 * agents only (role assistant/responder), highest priority first — so the
 * canonical persona is the default pick.
 *
 * Specialists (role `custom`: researcher, appsmith, …) are deliberately absent.
 * They're delegation targets, not chat entry points, and only responder/assistant
 * rows get the manifest's persona convergence on upgrade
 * (`reconcilePersonaCapabilitiesByRole`) and new specialists wired into their
 * delegation (`wireDelegation`) — a `custom` clone would quietly drift.
 */
function useSourceAgents() {
  return useQuery({
    queryKey: ['users', 'source-agents'],
    queryFn: async () => {
      const { agents } = await apiFetch<{ agents: SourceAgent[] }>('/api/agents');
      return agents.filter((a) => a.role === 'assistant' || a.role === 'responder');
    },
  });
}

/** The client report, for the What clients see step's card. A brain before
 *  client logins C1 answers 404: the step is left out. */
function useClientReport() {
  return useQuery({
    queryKey: CLIENT_REPORT_KEY,
    queryFn: fetchClientReport,
    retry: (count, err) => !isReportMissing(err) && count < 1,
  });
}

/** A section heading in the list column, in the review sections' style, with
 *  an optional count and one small text action on the right. */
function ListSectionHeading({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-2">
      <h2 id={id} className="flex items-center gap-1.5 text-xs font-semibold">
        {title}
        {count ? (
          <>
            {/* The dot is for the eye; the heading's name stays the word. */}
            <span
              aria-hidden
              className="inline-flex min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground"
            >
              {count}
            </span>
            <span className="sr-only">({count})</span>
          </>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/** One login's card in the list. */
function LoginCard({
  user,
  selected,
  onSelect,
}: {
  user: UserRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ListCard onClick={onSelect} selected={selected}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {user.displayName || user.email}
        </span>
        {user.role === 'member' && (
          <Badge variant="secondary" className="shrink-0">
            Member
          </Badge>
        )}
        {user.disabledAt && (
          <Badge variant="outline" className="shrink-0">
            Disabled
          </Badge>
        )}
        {user.agent && (
          <Badge variant="outline" className="shrink-0" title={user.agent.name}>
            <Bot className="size-3" /> {user.agent.name}
          </Badge>
        )}
        {user.isOwner && (
          <Badge variant="secondary" className="shrink-0">
            Anchor
          </Badge>
        )}
      </div>
      <ListCardMeta>
        {user.displayName
          ? user.email
          : user.lastLoginAt
            ? `Last login ${formatDateTime(user.lastLoginAt)}`
            : 'Never signed in'}
      </ListCardMeta>
    </ListCard>
  );
}

/** What the What clients see step's card says under its title. */
function reportMeta(report: ClientReport | undefined, failed: boolean): string {
  if (!report) return failed ? 'Could not load the list' : 'Loading…';
  if (report.acknowledged) return 'Checked. Clients can be added.';
  if (report.acknowledgement) return 'Changed since the check: check it again';
  return 'Step 1: check it before adding clients';
}

/**
 * Logins: ways INTO the one brain, not tenants. Everyone with an admin login
 * sees the same data; a member or client login sees only its level. The
 * list column holds, top to bottom: Open invites (a section above the list,
 * while any is open), the admin and member logins, then Clients: its two
 * steps (What clients see, Client settings) and the client logins. Invite and
 * Add login head the column; Add client heads Clients. One detail pane shows
 * whatever is selected, under its one header (ItemHeader).
 *
 * Invites, Clients, What clients see and each login's Chat moved here from
 * Team admin on 2026-10-09; their brain routes and admin-only gates are
 * unchanged (/api/team-admin/invites, /clients, /member-chats and
 * /api/access/client-report). The server enforces the invariants (anchor
 * undeletable, no self-delete); the UI just mirrors them.
 */
export function UsersClient() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<{ users: UserRow[]; currentActorId: string }>('/api/users'),
  });
  const invitesQuery = useMemberInvites();
  const clientsQuery = useClientLogins();
  const reportQuery = useClientReport();
  // Which logins have a team thread: an admin in it (a former member) keeps
  // its Chat. The same admin-only route the Chat view reads.
  const rosterQuery = useQuery({
    queryKey: ['team-admin', 'member-chats', 'roster'],
    queryFn: () => apiFetch<MemberChatsResponse>('/api/team-admin/member-chats'),
  });

  // Deep link: /settings/users?selected=<id-or-email | invite:<id> |
  // what-clients-see | client-settings>[&view=chat] preselects (initial state
  // only: selection stays client-state after).
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('selected'));
  const [chat, setChat] = useState(searchParams.get('view') === 'chat');
  const [addOpen, setAddOpen] = useState(false);
  // The Invite dialog, empty (Invite) or for an open invite's person (New
  // link). Owned here, not by the invite pane: a New link replaces that
  // invite, and the one-time link must stay on screen meanwhile.
  const [inviteSeed, setInviteSeed] = useState<
    (ReturnType<typeof newLinkSeed> & { key: number }) | null
  >(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const select = (id: string | null, opts: { chat?: boolean } = {}) => {
    setSelectedId(id);
    setChat(!!opts.chat);
  };
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: CLIENT_LOGINS_KEY });
    return queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  if (usersQuery.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (usersQuery.isError && !usersQuery.data) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>Couldn&apos;t load logins.</p>
        <Button variant="outline" size="sm" onClick={() => usersQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { users, currentActorId } = usersQuery.data;
  const team = users.filter((u) => u.role !== 'client');
  const clients = users.filter((u) => u.role === 'client');
  const invites = openInvites(invitesQuery.data?.invites);
  const reportMissing = isReportMissing(reportQuery.error);
  const clientsBlocked = clientActionsBlocked(clientsQuery.data);

  // What the detail pane shows: an open invite, a client step, or a login
  // (by id or email; the first login when nothing, or something gone, is
  // selected).
  const inviteId = inviteIdOf(selectedId);
  const invite = inviteId ? (invites.find((i) => i.id === inviteId) ?? null) : null;
  const step =
    selectedId === WHAT_CLIENTS_SEE && !reportMissing
      ? WHAT_CLIENTS_SEE
      : selectedId === CLIENT_SETTINGS
        ? CLIENT_SETTINGS
        : null;
  const selected =
    invite || step
      ? null
      : (users.find((u) => u.id === selectedId || u.email === selectedId) ?? users[0] ?? null);
  const selectedKey = invite ? inviteKey(invite.id) : (step ?? selected?.id ?? null);

  const showReport = () => select(WHAT_CLIENTS_SEE);
  const inRoster = rosterIds(rosterQuery.data);

  return (
    <>
      <MasterDetail
        id="settings-users"
        // The 340px this screen has always had.
        defaultListSize="340px"
        // No `detailFills`: the detail is a form, and the 672px default measure
        // is what keeps it off 1200px line lengths (§8).
        list={
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Logins
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setInviteSeed({ key: Date.now(), contact: null, email: '', name: '' })
                  }
                >
                  <MailPlus /> Invite
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus /> Add login
                </Button>
              </div>
            </div>
            <ReviewSections
              sections={[
                {
                  id: 'logins-open-invites',
                  title: 'Open invites',
                  rows: invites.map((i) => ({
                    id: inviteKey(i.id),
                    title: inviteName(i),
                    meta: `${i.email} · ${stateLine(i)}`,
                    onSelect: () => select(inviteKey(i.id)),
                  })),
                },
              ]}
              selectedId={selectedKey}
            />
            <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto md:scrollbar-thin">
              {team.map((u) => (
                <LoginCard
                  key={u.id}
                  user={u}
                  selected={selectedKey === u.id}
                  onSelect={() => select(u.id)}
                />
              ))}

              <section aria-labelledby="logins-clients" className="space-y-2">
                <ListSectionHeading
                  id="logins-clients"
                  title="Clients"
                  count={clients.length}
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={clientsBlocked}
                      title={clientsBlocked ? CLIENT_ACTIONS_BLOCKED_TEXT : undefined}
                      onClick={() => setAddClientOpen(true)}
                    >
                      <UserPlus /> Add client
                    </Button>
                  }
                />
                {reportMissing ? null : (
                  <ListCard
                    onClick={() => select(WHAT_CLIENTS_SEE)}
                    selected={selectedKey === WHAT_CLIENTS_SEE}
                  >
                    <div className="flex items-center gap-2">
                      <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        What clients see
                      </span>
                      {reportQuery.data && !reportQuery.data.acknowledged ? (
                        <Badge variant="outline" className="shrink-0">
                          To check
                        </Badge>
                      ) : null}
                    </div>
                    <ListCardMeta>{reportMeta(reportQuery.data, reportQuery.isError)}</ListCardMeta>
                  </ListCard>
                )}
                <ListCard
                  onClick={() => select(CLIENT_SETTINGS)}
                  selected={selectedKey === CLIENT_SETTINGS}
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      Client settings
                    </span>
                  </div>
                  <ListCardMeta>Sign-in codes by email, chat use, storage</ListCardMeta>
                </ListCard>
                {clients.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">No client logins yet.</p>
                ) : (
                  clients.map((u) => (
                    <LoginCard
                      key={u.id}
                      user={u}
                      selected={selectedKey === u.id}
                      onSelect={() => select(u.id)}
                    />
                  ))
                )}
              </section>
            </div>
          </>
        }
        // `relative` and the pane's single scroller are `MasterDetail`'s job now.
        detail={
          invite ? (
            <InviteDetail
              key={invite.id}
              invite={invite}
              onRevoked={() => select(null)}
              onNewLink={() => setInviteSeed({ key: Date.now(), ...newLinkSeed(invite) })}
            />
          ) : step === WHAT_CLIENTS_SEE ? (
            <ClientReportPane query={reportQuery} />
          ) : step === CLIENT_SETTINGS ? (
            <div>
              <ItemHeader
                sticky
                visual={<Settings2 className="size-4 text-muted-foreground" aria-hidden />}
                title="Client settings"
                iconActions={
                  <HeaderInfoButton label="About client settings">
                    <p>
                      What applies to every client login: how they get a sign-in code by email,
                      their chat use today against the daily limits, and what their own spaces hold.
                    </p>
                  </HeaderInfoButton>
                }
              />
              <ClientSettingsPanel />
            </div>
          ) : selected ? (
            <UserDetail
              key={selected.id}
              user={selected}
              isSelf={selected.id === currentActorId}
              hasChat={loginHasChat(selected.role, inRoster.has(selected.id))}
              chat={chat && loginHasChat(selected.role, inRoster.has(selected.id))}
              onChatChange={setChat}
              onChanged={() => void invalidate()}
              onRequestDelete={() => setDeleteOpen(true)}
              onRequestReset={() => setResetOpen(true)}
              onShowReport={showReport}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              <Users className="mr-2 size-4" /> No logins.
            </div>
          )
        }
      />

      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => {
          select(id);
          void invalidate();
        }}
      />
      {inviteSeed ? (
        <InviteDialog
          key={inviteSeed.key}
          open
          onOpenChange={(o) => !o && setInviteSeed(null)}
          initialContact={inviteSeed.contact}
          initialEmail={inviteSeed.email}
          initialName={inviteSeed.name}
          onCreated={(id) => select(inviteKey(id))}
        />
      ) : null}
      <AddClientDialog
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onCreated={(id) => {
          select(id);
          void invalidate();
        }}
      />
      {selected && (
        <>
          <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} user={selected} />
          <DeleteUserDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            user={selected}
            onDeleted={() => {
              select(null);
              void invalidate();
            }}
          />
        </>
      )}
    </>
  );
}

/** The What clients see step: the report under its one header, or why it
 *  cannot show. */
function ClientReportPane({ query }: { query: ReturnType<typeof useClientReport> }) {
  if (query.data) return <ClientReportPanel report={query.data} />;
  if (isReportMissing(query.error)) {
    return <p className="p-6 text-sm text-muted-foreground">{NOT_ON_THIS_BRAIN}</p>;
  }
  if (query.isError) {
    return (
      <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        Couldn&apos;t load the client list.
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
}

/** What a login is, in a sentence: the Info button's text. */
function loginAbout(user: UserRow): string {
  if (user.isOwner) return 'The anchor login. The brain is keyed to it, so it can’t be deleted.';
  if (user.role === 'member')
    return 'A member login: team-level items and chat only, at /m. Admin screens refuse it.';
  if (user.role === 'client')
    return 'A client login: client-level items only, signed in with a link issued below.';
  return 'Another way into this brain. Same brain, same data, same settings: actions are recorded under this identity.';
}

function UserDetail({
  user,
  isSelf,
  hasChat,
  chat,
  onChatChange,
  onChanged,
  onRequestDelete,
  onRequestReset,
  onShowReport,
}: {
  user: UserRow;
  isSelf: boolean;
  /** Whether it has a Chat: members, clients, and an admin with a team thread. */
  hasChat: boolean;
  /** The Chat view instead of the details. */
  chat: boolean;
  onChatChange: (chat: boolean) => void;
  onChanged: () => void;
  onRequestDelete: () => void;
  onRequestReset: () => void;
  onShowReport: () => void;
}) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const name = user.displayName || user.email;

  const saveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiSend(`/api/users/${user.id}`, 'PATCH', {
        displayName: displayName.trim() || null,
      });
      onChanged();
      toast.success('User saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* The pane's one header: name and state; Chat (members and clients) as
          the text action; Info and Delete as icons. */}
      <ItemHeader
        sticky
        title={name}
        badges={
          <>
            {user.isOwner && (
              <Badge variant="secondary">
                <Anchor className="size-3" /> Anchor
              </Badge>
            )}
            {isSelf && <Badge variant="outline">You</Badge>}
            {user.role === 'member' && <Badge variant="secondary">Member</Badge>}
            {user.role === 'client' && <Badge variant="outline">Client</Badge>}
            {user.disabledAt && <Badge variant="outline">Disabled</Badge>}
          </>
        }
        textActions={
          hasChat ? (
            <Button
              size="sm"
              variant={chat ? 'secondary' : 'outline'}
              aria-pressed={chat}
              onClick={() => onChatChange(!chat)}
            >
              <MessagesSquare /> Chat
            </Button>
          ) : null
        }
        iconActions={
          <>
            <HeaderInfoButton label="About this login">
              <p>{loginAbout(user)}</p>
            </HeaderInfoButton>
            {!user.isOwner && !isSelf && (
              <HeaderIconButton
                label="Delete login"
                className="text-muted-foreground hover:text-destructive-ink"
                onClick={onRequestDelete}
              >
                <Trash2 />
              </HeaderIconButton>
            )}
          </>
        }
      />

      {chat ? (
        <LoginChat loginId={user.id} name={name} />
      ) : (
        <div className="space-y-6 p-6">
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Email</div>
              <div className="mt-0.5 break-all">{user.email}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Created</div>
              <div className="mt-0.5">{formatDateTime(user.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Last login
              </div>
              <div className="mt-0.5">
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never signed in'}
              </div>
            </div>
          </div>

          <form onSubmit={saveDisplayName} noValidate className="space-y-3">
            <Field>
              <FieldLabel htmlFor="display-name">Display name</FieldLabel>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Their full name"
                aria-describedby={hintId('display-name')}
              />
              <FieldHint id="display-name">
                How this person appears in the app. Changing it doesn&apos;t affect their login.
              </FieldHint>
            </Field>
            <SubmitButton pending={saving}>Save user</SubmitButton>
          </form>

          {user.role === 'client' && (
            <ClientSigninCard loginId={user.id} onShowReport={onShowReport} />
          )}

          {!user.isOwner && !isSelf && <AccessCard user={user} onChanged={onChanged} />}

          {user.role === 'admin' && <AssistantCard user={user} onChanged={onChanged} />}

          {/* Only a password login (admin, member) has one: a client signs in
              with a link, and a role this app does not know gets nothing. */}
          {canResetPassword(user.role) && (
            <div className="rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="size-4 text-muted-foreground" /> Password
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Set a new password for this login. The reset is recorded in the audit log.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onRequestReset}>
                  Reset password
                </Button>
              </div>
            </div>
          )}

          <DevicesCard user={user} isSelf={isSelf} />
          {isSelf && <PairPhoneCard userId={user.id} />}
        </div>
      )}
    </div>
  );
}

/**
 * Role and access for one login (member logins, Phase 1): admin or member
 * (a member login is the team member itself), and a Disabled switch that stops the
 * login at once (sessions are re-checked every request; bearers are revoked).
 * A client login shows its role and no role change: the brain refuses one to
 * or from client (client logins C2).
 * Never shown for the anchor or your own login.
 */
function AccessCard({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState<'admin' | 'member'>(
    user.role === 'client' ? 'member' : user.role,
  );
  const [saving, setSaving] = useState(false);
  const dirty = role !== user.role;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiSend(`/api/users/${user.id}`, 'PATCH', { role });
      onChanged();
      toast.success(role === 'member' ? 'Now a member login' : 'Now an admin login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const setDisabled = async (disabled: boolean) => {
    setSaving(true);
    try {
      await apiSend(`/api/users/${user.id}`, 'PATCH', { disabled });
      onChanged();
      toast.success(disabled ? 'Login disabled' : 'Login enabled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the login');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Disabled</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Stops this login at once: it cannot sign in, and every session it holds ends.
          </p>
        </div>
        <Switch
          checked={!!user.disabledAt}
          disabled={saving}
          onCheckedChange={(v) => void setDisabled(v)}
          aria-label="Disable this login"
        />
      </div>
      {user.role === 'client' ? (
        <div className="border-t border-border pt-4">
          <div className="text-sm font-medium">Role</div>
          <p className="mt-0.5 text-sm">Client</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A client login stays a client. To give this person more, delete the client login and
            invite them as a member.
          </p>
        </div>
      ) : (
        <form onSubmit={save} noValidate className="space-y-3 border-t border-border pt-4">
          <RoleFields idPrefix={`user-${user.id}`} role={role} onRoleChange={setRole} />
          <SubmitButton pending={saving} disabled={!dirty}>
            Save role
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

type Device = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
};

/**
 * This login's live bearer sessions (mobile companion, detached web client),
 * revocable one at a time. Moved here from the retired Settings → Security
 * screen so that cutting someone off — delete the login, sign its devices out —
 * is one screen's work rather than two.
 *
 * The session COOKIE isn't listed: it has no row (it's stateless), so a
 * password reset and sign-out are what govern it.
 */
function DevicesCard({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const devicesQuery = useQuery({
    queryKey: ['users', user.id, 'devices'],
    queryFn: () => apiFetch<{ devices: Device[] }>(`/api/users/${user.id}/devices`),
  });

  const revoke = async (device: Device) => {
    try {
      await apiSend(`/api/users/${user.id}/devices/${device.id}`, 'DELETE');
      toast.success(`Signed out “${device.label}”.`);
      void queryClient.invalidateQueries({ queryKey: ['users', user.id, 'devices'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not revoke that device.');
    }
  };

  const devices = devicesQuery.data?.devices ?? [];

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MonitorSmartphone className="size-4 text-muted-foreground" /> Devices
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live sessions signed in as {isSelf ? 'you' : user.email}. Signing one out revokes its
            token immediately — the next request from it fails.
          </p>
        </div>
        <SignOutEverywhereButton user={user} isSelf={isSelf} />
      </div>

      {devicesQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading devices…</p>
      ) : devicesQuery.isError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load devices.</p>
          <Button variant="outline" size="sm" onClick={() => devicesQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No signed-in devices. Sessions from the mobile companion or a detached client appear here.
        </p>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              {/Web client/i.test(d.label) ? (
                <Monitor className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {d.label}
                  {d.current && (
                    <Badge variant="secondary" className="ml-2">
                      This device
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.lastUsedAt
                    ? `Last used ${formatDateTime(d.lastUsedAt)}`
                    : `Added ${formatDateTime(d.createdAt)}`}
                  {' · '}expires {formatDateTime(d.expiresAt)}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    Revoke
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out “{d.label}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The device&apos;s token is revoked immediately — its next request fails and it
                      must sign in again.
                      {d.current ? ' This is the device you are using right now.' : ''}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void revoke(d)}
                    >
                      Revoke device
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sign a login out on every device: its cookies, asset tokens and bearers
 * (the phone app, connected clients) all stop. Another login goes through
 * PATCH /api/users/:id `{ signOut: true }`; your own through the same route
 * the account menu uses, and then this browser signs out too.
 */
function SignOutEverywhereButton({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const outcome = isSelf ? await signOutEverywhere() : await signLoginOutEverywhere(user.id);
    if (outcome.kind === 'error') {
      setBusy(false);
      setOpen(false);
      toast.error(outcome.message);
      return;
    }
    if (isSelf || outcome.kind === 'signed-out') {
      // This browser's session is gone too (or already was). Signed out the
      // way the profile menu's Sign out everywhere does it: onto the next
      // login this device holds, else /login, in a page load.
      await signOutActive();
      return;
    }
    setBusy(false);
    setOpen(false);
    toast.success(`Signed ${user.displayName || user.email} out on every device.`);
    void queryClient.invalidateQueries({ queryKey: ['users', user.id, 'devices'] });
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          Sign out everywhere
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSelf
              ? 'Sign out everywhere?'
              : `Sign ${user.displayName || user.email} out everywhere?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSelf ? EVERYWHERE_CONFIRM : otherLoginEverywhereText(user)}
          </AlertDialogDescription>
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
            {busy ? 'Signing out…' : 'Sign out everywhere'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A login's personal assistant: create it, rename it, or release it.
 *
 * Releasing only drops the binding — the agent and its whole chat history stay,
 * as an ordinary shared agent under /settings/agents. Nothing here ever deletes
 * an agent; that stays a deliberate act on the agents screen.
 */
function AssistantCard({ user, onChanged }: { user: UserRow; onChanged: () => void }) {
  const toast = useToast();
  const sources = useSourceAgents();
  const [name, setName] = useState(user.agent?.name ?? '');
  const [sourceAgentId, setSourceAgentId] = useState('');
  const [pending, setPending] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [nameError, setNameError] = useState<string>();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    // §6b: was a toast naming a control, shown in a corner.
    if (!trimmed) {
      setNameError('Enter a name for the assistant.');
      document.getElementById(`user-${user.id}-agent-name`)?.focus();
      return;
    }
    setNameError(undefined);
    // With an assistant already in place and no explicit new source, this is a
    // rename — the server keeps the slug, so the existing thread survives.
    const source = user.agent ? sourceAgentId || undefined : sourceAgentId || sources.data?.[0]?.id;
    if (!user.agent && !source) {
      toast.error('No agent available to copy from.');
      return;
    }
    setPending(true);
    try {
      await apiSend(`/api/users/${user.id}/agent`, 'PUT', {
        name: trimmed,
        ...(source ? { sourceAgentId: source } : {}),
      });
      setSourceAgentId('');
      onChanged();
      toast.success(user.agent ? 'Assistant renamed' : 'Assistant created');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the assistant');
    } finally {
      setPending(false);
    }
  };

  const release = async () => {
    setPending(true);
    try {
      await apiSend(`/api/users/${user.id}/agent`, 'DELETE');
      setName('');
      setReleaseOpen(false);
      onChanged();
      toast.success('Assistant released');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not release the assistant');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 text-muted-foreground" /> Assistant
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.agent ? (
              <>
                Chats open on{' '}
                <a
                  href={`/settings/agents?selected=${user.agent.id}`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {user.agent.name}
                </a>{' '}
                for this login, on its own thread.
              </>
            ) : (
              'Shares the brain’s default assistant — chats land in the same thread as everyone else’s.'
            )}
          </p>
        </div>
        {user.agent && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setReleaseOpen(true)}
          >
            Release
          </Button>
        )}
      </div>
      <form onSubmit={save} noValidate className="space-y-3">
        <AssistantFields
          idPrefix={`user-${user.id}`}
          name={name}
          nameError={nameError}
          onNameChange={(v) => {
            setName(v);
            if (nameError) setNameError(undefined);
          }}
          sourceAgentId={sourceAgentId}
          onSourceAgentIdChange={setSourceAgentId}
          sources={sources.data ?? []}
          nameLabel="Assistant name"
          showSource={!user.agent}
          nameHint={
            user.agent
              ? 'Renaming keeps the same assistant and its chat history. To copy from a different agent, release this one and create a new one.'
              : undefined
          }
        />
        <SubmitButton pending={pending}>
          {user.agent ? 'Rename assistant' : 'Create assistant'}
        </SubmitButton>
      </form>

      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release {user.agent?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops being this login&apos;s assistant, so a fresh sign-in lands on the
              brain&apos;s default instead. Someone already chatting to it keeps their place until
              they pick another agent. The agent and its whole chat history stay — it becomes an
              ordinary shared agent, and you can delete it from Settings → Agents if you want it
              gone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void release();
              }}
            >
              Release assistant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Name + source-agent inputs for a login's personal assistant. Shared by the
 * Add-login dialog and the detail panel's assistant card, so the wording of
 * what this does — and what it does NOT do — is written once.
 */
function AssistantFields({
  idPrefix,
  name,
  onNameChange,
  sourceAgentId,
  onSourceAgentIdChange,
  sources,
  nameLabel = 'Assistant name (optional)',
  nameHint,
  nameError,
  showSource = true,
}: {
  idPrefix: string;
  name: string;
  onNameChange: (v: string) => void;
  sourceAgentId: string;
  onSourceAgentIdChange: (v: string) => void;
  sources: SourceAgent[];
  nameLabel?: string;
  nameHint?: React.ReactNode;
  /**
   * §6b. The name rule lives with the caller (it differs per caller — blank is
   * legal when adding a login, and a failure when renaming an assistant), so
   * the message comes down rather than the rule going up. Same shape as
   * `ToolGroupIntegrationSection`'s `serviceError`.
   */
  nameError?: string;
  /** False once an assistant exists — then the only in-place edit is a rename,
   *  which keeps the slug and therefore the thread. Pointing a login at a
   *  different source is Release + Create, so nobody strands a live thread by
   *  nudging a dropdown. */
  showSource?: boolean;
}) {
  const nameId = `${idPrefix}-agent-name`;
  const sourceId = `${idPrefix}-agent-source`;
  const selected = sourceAgentId || sources[0]?.id || '';
  return (
    <>
      <Field data-invalid={!!nameError || undefined}>
        <FieldLabel htmlFor={nameId}>{nameLabel}</FieldLabel>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Nova"
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? `${nameId}-error ${hintId(nameId)}` : hintId(nameId)}
        />
        <FieldHint
          id={nameId}
          warn="Not private: every login can still open this assistant and read its chat."
        >
          {nameHint ?? (
            <>
              Gives this login its own copy of an assistant, so their chat is a separate
              conversation instead of sharing one thread with everyone else. Leave blank to share
              the brain&apos;s default assistant.
            </>
          )}
        </FieldHint>
        <FieldError id={`${nameId}-error`}>{nameError}</FieldError>
      </Field>
      {showSource && name.trim().length > 0 && (
        <Field>
          <FieldLabel htmlFor={sourceId}>Copy from</FieldLabel>
          <Select value={selected} onValueChange={onSourceAgentIdChange}>
            <SelectTrigger id={sourceId} aria-describedby={hintId(sourceId)}>
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {shortModelName(a.model)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint id={sourceId}>
            The copy keeps its source&apos;s model, prompt, skills and tools, but answers to the
            name you give it here — it just gets its own chat history. Telegram bots and the rules
            it learned (in the Journal) aren&apos;t copied.
          </FieldHint>
        </Field>
      )}
    </>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [role, setRole] = useState<'admin' | 'member'>('admin');
  const [displayName, setDisplayName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [sourceAgentId, setSourceAgentId] = useState('');
  const [pending, setPending] = useState(false);
  const sources = useSourceAgents();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // §6b. `required` + `type="email"` + `minLength` were the browser's bubble:
    // announced to nothing and gone on the next click. Same rules, on the
    // controls. The form is `noValidate`.
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = 'An email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'That does not look like an email address.';
    if (!password) errs.password = 'A starting password is required.';
    else if (password.length < 8) errs.password = 'Use at least 8 characters.';
    if (errs.email || errs.password) {
      setErrors(errs);
      document.getElementById(errs.email ? 'new-user-email' : 'new-user-password')?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    try {
      // A blank assistant name means "share the brain default", exactly as every
      // login behaved before per-login assistants existed.
      const wantsAgent = role === 'admin' && agentName.trim().length > 0;
      const source = sourceAgentId || sources.data?.[0]?.id;
      if (wantsAgent && !source) {
        toast.error('No agent available to copy from.');
        return;
      }
      const res = await apiSend<{ id: string; agentError: string | null }>('/api/users', 'POST', {
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        ...(wantsAgent ? { agent: { name: agentName.trim(), sourceAgentId: source } } : {}),
        ...(role === 'member' ? { role } : {}),
      });
      if (res.agentError) toast.error(res.agentError);
      else toast.success(wantsAgent ? 'Login and assistant added' : 'User added');
      setEmail('');
      setPassword('');
      setDisplayName('');
      setAgentName('');
      setSourceAgentId('');
      setRole('admin');
      onOpenChange(false);
      onCreated(res.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add user');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add login</DialogTitle>
          <DialogDescription>
            Another way into this brain — same data, same settings, no separate account. Share the
            starting password; it can be changed after signing in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <Field data-invalid={!!errors.email || undefined}>
            <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
            <Input
              id="new-user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="off"
              aria-invalid={!!errors.email || undefined}
              aria-describedby={
                errors.email ? 'new-user-email-error new-user-email-hint' : 'new-user-email-hint'
              }
            />
            <FieldHint id="new-user-email">
              Their login. It can&apos;t be changed afterwards.
            </FieldHint>
            <FieldError id="new-user-email-error">{errors.email}</FieldError>
          </Field>
          <Field data-invalid={!!errors.password || undefined}>
            <FieldLabel htmlFor="new-user-password">Starting password</FieldLabel>
            <SecretInput
              id="new-user-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="off"
              aria-invalid={!!errors.password || undefined}
              aria-describedby={
                errors.password
                  ? 'new-user-password-error new-user-password-hint'
                  : 'new-user-password-hint'
              }
            />
            <FieldHint
              id="new-user-password"
              warn="You'll need to pass this to them yourself — it isn't emailed."
            >
              What they sign in with the first time.
            </FieldHint>
            <FieldError id="new-user-password-error">{errors.password}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="new-user-display-name">Display name (optional)</FieldLabel>
            <Input
              id="new-user-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Their full name"
              aria-describedby={hintId('new-user-display-name')}
            />
            <FieldHint id="new-user-display-name">
              Falls back to the email address when blank.
            </FieldHint>
          </Field>
          <RoleFields idPrefix="new-user" role={role} onRoleChange={setRole} />
          {role === 'admin' && (
            <AssistantFields
              idPrefix="new-user"
              name={agentName}
              onNameChange={setAgentName}
              sourceAgentId={sourceAgentId}
              onSourceAgentIdChange={setSourceAgentId}
              sources={sources.data ?? []}
            />
          )}
          <div className="flex justify-end pt-1">
            <SubmitButton pending={pending}>Add login</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same rules `required` + `minLength={8}` already encoded (§6b).
    if (!password) {
      setError('A new password is required.');
      document.getElementById('reset-password-value')?.focus();
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      document.getElementById('reset-password-value')?.focus();
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await apiSend(`/api/users/${user.id}/password`, 'POST', { newPassword: password });
      toast.success(`Password reset for ${user.email}`);
      setPassword('');
      onOpenChange(false);
    } catch (err) {
      toast.error(resetPasswordErrorMessage(err));
      if (isNotAPasswordLogin(err)) {
        // Nothing to retry: this login has no password (its role moved
        // under the list). Close, and reload the list.
        setPassword('');
        onOpenChange(false);
        void queryClient.invalidateQueries({ queryKey: ['users'] });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user.email}. Their current password stops working immediately;
            the reset is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="reset-password-value">New password</FieldLabel>
            <SecretInput
              id="reset-password-value"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="off"
              aria-invalid={!!error || undefined}
              aria-describedby={
                error
                  ? 'reset-password-value-error reset-password-value-hint'
                  : 'reset-password-value-hint'
              }
            />
            <FieldHint
              id="reset-password-value"
              warn="Their old password stops working the moment you save."
            >
              What they&apos;ll sign in with from now on.
            </FieldHint>
            <FieldError id="reset-password-value-error">{error}</FieldError>
          </Field>
          <div className="flex justify-end pt-1">
            <SubmitButton pending={pending}>Reset password</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await apiSend(`/api/users/${user.id}`, 'DELETE');
      toast.success(`Removed ${user.email}`);
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete user');
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {user.displayName || user.email}?</AlertDialogTitle>
          <AlertDialogDescription>{loginDeleteText(user)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            Delete user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
