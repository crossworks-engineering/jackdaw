'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Layers, UserMinus, X } from 'lucide-react';
import type { ContactRow } from '@mantle/content-core/contacts-format';
import { apiFetch } from '@mantle/web-ui/api-fetch';
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
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@mantle/web-ui/ui/field';
import { FieldHint, hintId } from '@mantle/web-ui/ui/field-hint';
import { Input } from '@mantle/web-ui/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { HeaderIconButton, HeaderInfoButton, ItemHeader } from '@/components/layout/item-header';
import {
  ContactPicker,
  contactLabel,
  type PickedContact,
} from '@/components/team-admin/contact-picker';
import {
  ADMIN_ADD_TEXT,
  ADMIN_MODERATED_TEXT,
  HAS_HISTORY_TEXT,
  RESOURCE_KINDS,
  addableHits,
  addableResources,
  archiveBlocked,
  archiveConfirmText,
  canArchiveWorkspace,
  canChangeUser,
  canManageWorkspace,
  canPickAssistant,
  addedText,
  canSetConnectors,
  BUILT_IN_NAME_HINT,
  canRemoveUser,
  isBuiltIn,
  userSearchPaged,
  canSetContact,
  removeUserText,
  userLabel,
  userSearchMin,
  userSearchReady,
  workspaceErrorCode,
  workspaceErrorText,
  type ArchivePreview,
  type ResourceKind,
  type Workspace,
  type WorkspaceDetail,
  type WorkspaceResource,
  type WorkspaceUser,
} from '@/lib/workspaces';
import {
  fetchArchivePreview,
  useUserSearch,
  useWorkspaceActions,
  useWorkspaceDetail,
} from '@/components/workspaces/workspace-queries';
import { useShellWorkspaces } from '@/components/workspaces/use-shell-workspaces';

/** A contact is set, but this login does not read contacts. */
const CONTACT_SET_TEXT = 'Set by an Admin user';

/** The value the assistant picker uses for "no assistant". */
const NO_ASSISTANT = 'none';

/**
 * The ONE workspace screen (plan 1.4, 7.1): the same screen for every
 * workspace. Its sections, top to bottom: name, description and contact;
 * users with a Moderator tick; the assistant (at most one); then one section
 * per resource type (connectors in W5a), each row with a Write tick.
 *
 * Who sees what: a Moderator of the workspace, or a login with the Users and
 * workspaces area, gets the controls; any other user reads the same screen
 * with no controls. Within that, the contact is an Admin user's, the
 * assistant needs the Assistants area, an Admin user's own Moderator row is
 * an Admin user's to change, and a connector row the level bridge keeps
 * (until W5b) has no controls. The brain checks every change again.
 */
export function WorkspaceScreen({
  workspace,
  areas,
  onArchived,
}: {
  /** The list's row: the header renders from it while the detail loads. */
  workspace: Workspace;
  areas: readonly string[] | undefined;
  onArchived: () => void;
}) {
  const detail = useWorkspaceDetail(workspace.id);
  const ws = detail.data?.workspace ?? workspace;
  const manage = canManageWorkspace(ws, areas);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div>
      <ItemHeader
        sticky
        visual={<Layers className="size-4 text-muted-foreground" aria-hidden />}
        title={ws.name}
        badges={
          <>
            {ws.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
            {ws.me.moderator && !ws.archived ? <Badge variant="outline">Moderator</Badge> : null}
            {ws.archived ? <Badge variant="outline">Archived</Badge> : null}
          </>
        }
        iconActions={
          <>
            <HeaderInfoButton label="About workspaces">
              <p>
                A workspace is a group of users. Items shared with it can be read by its users.
                Moderators change the workspace and its items.
              </p>
              {ws.isAdmin ? (
                <p>The users of Admin manage the brain: settings, users and workspaces.</p>
              ) : null}
            </HeaderInfoButton>
            {canArchiveWorkspace(ws, areas) ? (
              <HeaderIconButton
                label="Archive workspace"
                className="text-muted-foreground hover:text-destructive-ink"
                onClick={() => setArchiveOpen(true)}
              >
                <Archive />
              </HeaderIconButton>
            ) : null}
          </>
        }
      />
      {detail.data ? (
        <WorkspaceSections detail={detail.data} manage={manage} areas={areas} />
      ) : detail.isError ? (
        <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          {workspaceErrorText(detail.error, 'Could not load this workspace.')}
          <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {archiveOpen ? (
        <ArchiveDialog workspace={ws} onOpenChange={setArchiveOpen} onArchived={onArchived} />
      ) : null}
    </div>
  );
}

/** The sections, from the loaded detail. `manage` decides controls or text. */
export function WorkspaceSections({
  detail,
  manage,
  areas,
}: {
  detail: WorkspaceDetail;
  manage: boolean;
  areas: readonly string[] | undefined;
}) {
  const { workspace: ws } = detail;
  return (
    <div className="space-y-6 p-6">
      {manage ? (
        <AboutForm key={ws.id} workspace={ws} contactEditable={canSetContact(areas)} />
      ) : (
        <AboutText workspace={ws} contactReadable={canSetContact(areas)} />
      )}
      <UsersSection detail={detail} manage={manage} areas={areas} />
      <AssistantSection detail={detail} manage={manage && canPickAssistant(areas)} />
      {RESOURCE_KINDS.map((k) => (
        <ResourceSection
          key={k.kind}
          spec={k}
          detail={detail}
          manage={manage && canSetConnectors(areas)}
        />
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  labelledBy,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  labelledBy: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className="space-y-3 rounded-md border border-border p-4">
      <div className="min-w-0">
        <h3 id={labelledBy} className="text-sm font-medium">
          {title}
        </h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ── Name, description, contact ──────────────────────────────────────────────

/** The workspace's contact, read for its name (information only). Contacts
 *  are an Admin user's screen: anyone else is never sent to ask. */
function useContact(id: string | null, readable: boolean) {
  return useQuery({
    queryKey: ['contacts', 'one', id],
    queryFn: () => apiFetch<{ contact: ContactRow }>(`/api/contacts/${id}`).then((r) => r.contact),
    enabled: !!id && readable,
    staleTime: 60_000,
  });
}

/** What the contact line says. */
function contactText(
  id: string | null,
  readable: boolean,
  contact: ContactRow | undefined,
  failed: boolean,
): string {
  if (!id) return 'None';
  if (contact) return contactLabel(contact);
  return !readable || failed ? CONTACT_SET_TEXT : '…';
}

function AboutText({
  workspace: ws,
  contactReadable,
}: {
  workspace: Workspace;
  contactReadable: boolean;
}) {
  const contact = useContact(ws.contactNodeId, contactReadable);
  return (
    <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Description</div>
        <div className="mt-0.5 whitespace-pre-wrap">{ws.description.trim() || 'None'}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Contact</div>
        <div className="mt-0.5">
          {contactText(ws.contactNodeId, contactReadable, contact.data, contact.isError)}
        </div>
      </div>
    </div>
  );
}

function AboutForm({
  workspace: ws,
  contactEditable,
}: {
  workspace: Workspace;
  /** The brain lets an Admin user set the contact, nobody else. */
  contactEditable: boolean;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const contactQuery = useContact(ws.contactNodeId, contactEditable);
  const [name, setName] = useState(ws.name);
  const [description, setDescription] = useState(ws.description);
  // undefined: the saved contact, not changed here.
  const [contact, setContact] = useState<PickedContact | null | undefined>(undefined);
  const [nameError, setNameError] = useState<string>();
  const [pending, setPending] = useState(false);
  // Admin and Team keep their names (change 19: 409 reserved_name).
  const nameFixed = isBuiltIn(ws);

  const savedContact: PickedContact | null =
    ws.contactNodeId && contactQuery.data
      ? {
          id: contactQuery.data.id,
          name: contactLabel(contactQuery.data),
          email: contactQuery.data.email || null,
        }
      : null;
  const shownContact = contact === undefined ? savedContact : contact;
  const contactId = contact === undefined ? ws.contactNodeId : (contact?.id ?? null);
  const dirty =
    name.trim() !== ws.name ||
    description.trim() !== ws.description.trim() ||
    contactId !== ws.contactNodeId;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Enter a name.');
      document.getElementById('workspace-name')?.focus();
      return;
    }
    setNameError(undefined);
    setPending(true);
    try {
      await actions.update(ws.id, {
        ...(nameFixed ? {} : { name: name.trim() }),
        description: description.trim(),
        ...(contactEditable ? { contactNodeId: contactId } : {}),
      });
      setContact(undefined);
      toast.success('Workspace saved');
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <FieldGroup>
        <Field data-invalid={!!nameError || undefined}>
          <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
          <Input
            id="workspace-name"
            value={name}
            maxLength={120}
            readOnly={nameFixed}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError || undefined}
            aria-describedby={
              [nameFixed ? hintId('workspace-name') : '', nameError ? 'workspace-name-error' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {nameFixed ? <FieldHint id="workspace-name">{BUILT_IN_NAME_HINT}</FieldHint> : null}
          <FieldError id="workspace-name-error">{nameError}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="workspace-description">Description</FieldLabel>
          <Textarea
            id="workspace-description"
            value={description}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="workspace-contact">Contact (optional)</FieldLabel>
          {!contactEditable ? (
            <p id="workspace-contact" className="text-sm">
              {contactText(ws.contactNodeId, false, undefined, false)}
            </p>
          ) : ws.contactNodeId && contact === undefined && contactQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ContactPicker
              id="workspace-contact"
              hintId={hintId('workspace-contact')}
              enabled
              contact={shownContact}
              onChange={setContact}
            />
          )}
          <FieldHint id="workspace-contact">
            Who this workspace is for. Information only: it gives nobody access.
            {contactEditable ? null : ' An Admin user sets it.'}
          </FieldHint>
        </Field>
        <div>
          <SubmitButton pending={pending} disabled={!dirty}>
            Save
          </SubmitButton>
        </div>
      </FieldGroup>
    </form>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────

function UsersSection({
  detail,
  manage,
  areas,
}: {
  detail: WorkspaceDetail;
  manage: boolean;
  areas: readonly string[] | undefined;
}) {
  const { workspace: ws, users } = detail;
  const [removing, setRemoving] = useState<WorkspaceUser | null>(null);
  // Who is looking (the shell names the login), for their own row in Admin.
  const viewerEmail = useShellWorkspaces()?.login;
  return (
    <Section
      title="Users"
      labelledBy="workspace-users"
      description={
        manage
          ? 'Users read the items shared with this workspace. Moderators also change them and manage the workspace.'
          : 'Users read the items shared with this workspace. Moderators manage it.'
      }
    >
      {ws.adminModerated ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {ADMIN_MODERATED_TEXT}
        </p>
      ) : null}
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users.</p>
      ) : (
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <UserRow
              key={u.loginId}
              workspaceId={ws.id}
              user={u}
              manage={manage}
              changeable={manage && canChangeUser(u)}
              removable={manage && canChangeUser(u) && canRemoveUser(ws, u, viewerEmail)}
              onRemove={() => setRemoving(u)}
            />
          ))}
        </ul>
      )}
      {manage ? (
        <AddUser detail={detail} min={userSearchMin(areas)} paged={userSearchPaged(areas)} />
      ) : null}
      {removing ? (
        <RemoveUserDialog
          workspace={ws}
          user={removing}
          onOpenChange={(o) => !o && setRemoving(null)}
        />
      ) : null}
    </Section>
  );
}

function UserRow({
  workspaceId,
  user: u,
  manage,
  changeable,
  removable,
  onRemove,
}: {
  workspaceId: string;
  user: WorkspaceUser;
  manage: boolean;
  /** Its tick and Remove: never on an Admin user kept in Team. */
  changeable: boolean;
  /** Remove: as `changeable`, and never the viewer's own row in Admin. */
  removable: boolean;
  onRemove: () => void;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const [pending, setPending] = useState(false);
  const label = userLabel(u);
  const added = addedText(u);
  const tickId = `workspace-moderator-${u.loginId}`;

  const setModerator = async (moderator: boolean) => {
    setPending(true);
    try {
      await actions.setModerator(workspaceId, u.loginId, moderator);
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-2" data-testid="workspace-user">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        {u.name?.trim() ? (
          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
        ) : null}
        {added ? <div className="truncate text-xs text-muted-foreground">{added}</div> : null}
      </div>
      {manage ? (
        <div className="flex shrink-0 items-center gap-2">
          <Checkbox
            id={tickId}
            checked={u.moderator || u.adminViaArea}
            disabled={pending || !changeable}
            onCheckedChange={(v) => void setModerator(v === true)}
          />
          <label htmlFor={tickId} className="text-xs">
            {u.adminViaArea ? 'Moderator (Admin user)' : 'Moderator'}
          </label>
        </div>
      ) : u.moderator || u.adminViaArea ? (
        <Badge variant="outline" className="shrink-0">
          Moderator
        </Badge>
      ) : null}
      {removable ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
          className="shrink-0 text-muted-foreground hover:text-destructive-ink"
          onClick={onRemove}
        >
          <UserMinus />
        </Button>
      ) : null}
    </li>
  );
}

function AddUser({
  detail,
  min,
  paged,
}: {
  detail: WorkspaceDetail;
  min: number;
  /** An Admin user: the full list, in pages of 50. */
  paged: boolean;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  // The picker opens on focus or a key: no search (an Admin user's empty
  // one included) is sent just for opening the screen.
  const [opened, setOpened] = useState(false);
  const search = useUserSearch(q, opened, min, paged);
  const hits = addableHits(search.hits ?? [], detail.users);
  const ready = opened && userSearchReady(q, min);

  const add = async (loginId: string, name: string) => {
    setAdding(loginId);
    try {
      await actions.addUser(detail.workspace.id, loginId);
      toast.success(`${name} added`);
      setQ('');
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setAdding(null);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor="workspace-user-search">Add a user</FieldLabel>
      <Input
        id="workspace-user-search"
        value={q}
        onFocus={() => setOpened(true)}
        onChange={(e) => {
          setOpened(true);
          setQ(e.target.value);
        }}
        placeholder="Search by name or email"
        autoComplete="off"
        aria-describedby={hintId('workspace-user-search')}
      />
      <FieldHint id="workspace-user-search">
        {min > 0 ? `Type at least ${min} letters. ` : 'Type to narrow the list. '}
        {detail.workspace.isAdmin
          ? ADMIN_ADD_TEXT
          : 'A new user reads every item shared with this workspace.'}
      </FieldHint>
      {ready && search.isError ? (
        <p className="text-sm text-muted-foreground">
          {workspaceErrorText(search.error, 'Search failed.')}
        </p>
      ) : ready && search.hits && hits.length === 0 && !search.hasMore ? (
        <p className="text-sm text-muted-foreground">No other users match.</p>
      ) : ready && hits.length > 0 ? (
        <div>
          <ul className="-mx-1 max-h-56 overflow-y-auto rounded-md border border-border px-1 scrollbar-thin">
            {hits.map((h) => {
              const name = userLabel(h);
              return (
                <li key={h.loginId} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {name}
                    {h.name?.trim() ? (
                      <span className="text-muted-foreground"> · {h.email}</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={adding !== null}
                    onClick={() => void add(h.loginId, name)}
                  >
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
          {search.hasMore ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1"
              disabled={search.loadingMore}
              onClick={search.loadMore}
            >
              Show more
            </Button>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}

function RemoveUserDialog({
  workspace: ws,
  user,
  onOpenChange,
}: {
  workspace: Workspace;
  user: WorkspaceUser;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const [pending, setPending] = useState(false);
  const name = userLabel(user);
  const remove = async () => {
    setPending(true);
    try {
      await actions.removeUser(ws.id, user.loginId);
      toast.success(`${name} removed`);
      onOpenChange(false);
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {name} from {ws.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>{removeUserText(ws, name)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Assistant ───────────────────────────────────────────────────────────────

type AgentOption = { id: string; name: string; role: string };

/** Agents that talk to users (assistant and responder roles). Specialists
 *  are helpers, never a workspace's assistant (plan 5.1). */
function useAssistantOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['workspaces', 'assistant-options'],
    queryFn: () =>
      apiFetch<{ agents: AgentOption[] }>('/api/agents').then((r) =>
        r.agents.filter((a) => a.role === 'assistant' || a.role === 'responder'),
      ),
    enabled,
  });
}

function AssistantSection({ detail, manage }: { detail: WorkspaceDetail; manage: boolean }) {
  const { workspace: ws, hasHistory } = detail;
  const toast = useToast();
  const actions = useWorkspaceActions();
  const options = useAssistantOptions(manage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const current = ws.assistant?.id ?? NO_ASSISTANT;
  // An assistant with history stays: it cannot be swapped or removed, only
  // cloned to use elsewhere (plan 21.8 row 14).
  const frozen = hasHistory && !!ws.assistant;
  const list = options.data ?? [];
  const all =
    ws.assistant && !list.some((a) => a.id === ws.assistant!.id)
      ? [{ id: ws.assistant.id, name: ws.assistant.name, role: 'assistant' }, ...list]
      : list;

  const pick = async (value: string) => {
    if (value === current) return;
    setPending(true);
    setError(undefined);
    try {
      await actions.update(ws.id, { assistantId: value === NO_ASSISTANT ? null : value });
      toast.success(value === NO_ASSISTANT ? 'Assistant removed' : 'Assistant set');
    } catch (err) {
      // 409 assistant_has_history: the brain's words, beside the picker.
      if (workspaceErrorCode(err) === 'assistant_has_history') setError(workspaceErrorText(err));
      else toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section
      title="Assistant"
      labelledBy="workspace-assistant"
      description="At most one. It reads only the items of this workspace, and its memory stays here."
    >
      {manage ? (
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="workspace-assistant-pick" className="sr-only">
            Assistant
          </FieldLabel>
          <Select value={current} onValueChange={(v) => void pick(v)} disabled={pending || frozen}>
            <SelectTrigger
              id="workspace-assistant-pick"
              aria-invalid={!!error || undefined}
              aria-describedby={
                [
                  hasHistory ? hintId('workspace-assistant-pick') : '',
                  error ? 'workspace-assistant-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ASSISTANT}>No assistant</SelectItem>
              {all.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasHistory ? (
            <FieldHint id="workspace-assistant-pick">{HAS_HISTORY_TEXT}</FieldHint>
          ) : null}
          <FieldError id="workspace-assistant-error">{error}</FieldError>
        </Field>
      ) : (
        <div className="text-sm">
          <p>{ws.assistant?.name ?? 'No assistant'}</p>
          {ws.assistant && hasHistory ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{HAS_HISTORY_TEXT}</p>
          ) : null}
        </div>
      )}
    </Section>
  );
}

// ── Resources (one section per type: connectors in W5a) ─────────────────────

type ConnectorOption = { slug: string; name: string };

function useConnectorOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['workspaces', 'connector-options'],
    queryFn: () =>
      apiFetch<{ connectors: ConnectorOption[] }>('/api/mcp-connectors').then((r) =>
        r.connectors.map((c) => ({ slug: c.slug, name: c.name })),
      ),
    enabled,
  });
}

function ResourceSection({
  spec,
  detail,
  manage,
}: {
  spec: ResourceKind;
  detail: WorkspaceDetail;
  manage: boolean;
}) {
  const rows = detail.resources.filter((r) => r.kind === spec.kind);
  return (
    <Section title={spec.label} labelledBy={`workspace-${spec.kind}`} description={spec.writeHint}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {spec.noun}s.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <ResourceRow
              key={`${r.kind}:${r.id}`}
              workspaceId={detail.workspace.id}
              resource={r}
              manage={manage}
            />
          ))}
        </ul>
      )}
      {/* Admin and Team attach connectors here like any workspace (contract 24). */}
      {manage && spec.kind === 'connector' ? <AddConnector detail={detail} spec={spec} /> : null}
    </Section>
  );
}

function ResourceRow({
  workspaceId,
  resource: r,
  manage,
}: {
  workspaceId: string;
  resource: WorkspaceResource;
  manage: boolean;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const [pending, setPending] = useState(false);
  const tickId = `workspace-write-${r.kind}-${r.id}`;
  const editable = manage;

  const run = async (p: () => Promise<unknown>) => {
    setPending(true);
    try {
      await p();
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-2" data-testid="workspace-resource">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.name}</div>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-2">
          <Checkbox
            id={tickId}
            checked={r.write}
            disabled={pending}
            onCheckedChange={(v) =>
              void run(() => actions.setResourceWrite(workspaceId, r.kind, r.id, v === true))
            }
          />
          <label htmlFor={tickId} className="text-xs">
            Write
          </label>
        </div>
      ) : r.write ? (
        <Badge variant="outline" className="shrink-0">
          Write
        </Badge>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Read only</span>
      )}
      {editable ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove ${r.name}`}
          title={`Remove ${r.name}`}
          disabled={pending}
          className="shrink-0 text-muted-foreground hover:text-destructive-ink"
          onClick={() => void run(() => actions.removeResource(workspaceId, r.kind, r.id))}
        >
          <X />
        </Button>
      ) : null}
    </li>
  );
}

function AddConnector({ detail, spec }: { detail: WorkspaceDetail; spec: ResourceKind }) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const options = useConnectorOptions(true);
  const [pending, setPending] = useState(false);
  const addable = addableResources(options.data ?? [], detail.resources, spec.kind);
  if (!options.data || addable.length === 0) return null;

  const add = async (slug: string) => {
    setPending(true);
    try {
      await actions.addResource(detail.workspace.id, spec.kind, slug);
    } catch (err) {
      toast.error(workspaceErrorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={`workspace-add-${spec.kind}`}>Add a {spec.noun}</FieldLabel>
      {/* No value: the picker only adds, then shows its placeholder again. */}
      <Select value="" onValueChange={(v) => void add(v)} disabled={pending}>
        <SelectTrigger id={`workspace-add-${spec.kind}`}>
          <SelectValue placeholder={`Choose a ${spec.noun}`} />
        </SelectTrigger>
        <SelectContent>
          {addable.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// ── Archive ─────────────────────────────────────────────────────────────────

function ArchiveDialog({
  workspace: ws,
  onOpenChange,
  onArchived,
}: {
  workspace: Workspace;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const preview = useQuery({
    queryKey: ['workspaces', ws.id, 'archive-preview'],
    queryFn: () => fetchArchivePreview(ws.id),
    staleTime: 0,
    gcTime: 0,
  });
  const [pending, setPending] = useState(false);

  const archive = async () => {
    setPending(true);
    try {
      await actions.archive(ws.id);
      toast.success(`${ws.name} archived`);
      onOpenChange(false);
      onArchived();
    } catch (err) {
      toast.error(workspaceErrorText(err, 'Could not archive.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {ws.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            <ArchiveText
              name={ws.name}
              preview={preview.data}
              failed={preview.isError}
              error={preview.error}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !preview.data || archiveBlocked(preview.data)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void archive();
            }}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ArchiveText({
  name,
  preview,
  failed,
  error,
}: {
  name: string;
  preview: ArchivePreview | undefined;
  failed: boolean;
  error: unknown;
}) {
  if (preview) return <>{archiveConfirmText(name, preview)}</>;
  if (failed) return <>{workspaceErrorText(error, 'Could not count what this changes.')}</>;
  return <>Counting what this changes…</>;
}
