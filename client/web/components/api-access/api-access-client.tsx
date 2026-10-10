'use client';

/**
 * Settings > API access (brain migration 0232): API keys for scripts and
 * MCP clients. A key acts exactly as the login that made it, with the same
 * rights (workspaces W5b2: no access or area limits). It works as a Bearer
 * on the public API (/api/v1) and on /api/mcp. The secret is shown
 * once, right after it is made.
 *
 * Every login makes and revokes its own keys. An admin also sees, and may
 * revoke, every key on the brain. Not the outbound "API keys" screen
 * (/settings/keys): those are keys this brain uses to call other services.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import type { AccessKeyCreated, AccessKeyList, AccessKeyView } from '@mantle/client-types';
import { apiFetch, apiSend, apiUrl, ApiError } from '@mantle/web-ui/api-fetch';
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
import { CopyBlock } from '@mantle/web-ui/ui/copy-button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import {
  EXPIRY_LABEL,
  createBody,
  defaultExpiryChoice,
  exampleCommands,
  expiryChoicesFor,
  scopeLine,
  sortKeys,
  type CreateForm,
  type CreateRules,
} from './api-access-model';

const QUERY_KEY = ['access-keys'];

/** The brain's origin, for the example commands: the API base in the split
 *  topology, this page's origin otherwise. */
function brainOrigin(): string {
  return new URL(apiUrl('/'), window.location.href).origin;
}

export function ApiAccessClient() {
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AccessKeyList>('/api/access-keys'),
  });
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<(AccessKeyCreated & { name: string }) | null>(null);
  const [revoking, setRevoking] = useState<AccessKeyView | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const revoke = async (key: AccessKeyView) => {
    try {
      await apiSend(`/api/access-keys/${key.id}`, 'DELETE');
      toast.success(`Revoked ${key.name}`);
      if (minted?.id === key.id) setMinted(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not revoke the key');
    } finally {
      setRevoking(null);
    }
  };

  const data = query.data;
  const isAdmin = data?.role === 'admin';
  const keys = data ? sortKeys(data.keys) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Keys for scripts and MCP</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A key lets a script or an MCP client use this brain as you, with the same rights as
                your login. It works on the public API (<code>/api/v1</code>) and on MCP.{' '}
                {data && !data.needsPassword
                  ? 'Your keys end when you sign out. Revoke a key here.'
                  : 'A plain sign-out does not end a key; a password change or Sign out everywhere ends all of them. Revoke a key here.'}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreating(true)} disabled={!data}>
            <Plus /> Make key
          </Button>
        </div>

        {minted && (
          <NewKeyPanel minted={minted} origin={brainOrigin()} onDone={() => setMinted(null)} />
        )}

        {query.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground md:p-5">Loading…</div>
        ) : query.isError ? (
          <div className="p-4 text-sm text-destructive-ink md:p-5">Could not load the keys.</div>
        ) : keys.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground md:p-5">No keys yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <KeyRow key={k.id} k={k} showOwner={isAdmin} onRevoke={() => setRevoking(k)} />
            ))}
          </ul>
        )}
      </section>

      {data && (
        <CreateKeyDialog
          open={creating}
          onOpenChange={setCreating}
          rules={{
            isAdmin,
            needsPassword: data.needsPassword,
            maxExpiryDays: data.maxExpiryDays,
          }}
          defaultExpiryDays={data.defaultExpiryDays}
          onCreated={async (made) => {
            setMinted(made);
            setCreating(false);
            await refresh();
          }}
        />
      )}

      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The key stops working on its next request. Scripts and MCP clients that use it get
              401. You cannot undo this; make a new key instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revoking && revoke(revoking)}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KeyRow({
  k,
  showOwner,
  onRevoke,
}: {
  k: AccessKeyView;
  showOwner: boolean;
  onRevoke: () => void;
}) {
  const ended = k.status !== 'active';
  return (
    <li
      className={`flex items-start justify-between gap-3 p-4 md:px-5 ${ended ? 'opacity-60' : ''}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{k.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k.prefix}</code>
          {k.status === 'revoked' && <Badge variant="outline">Revoked</Badge>}
          {k.status === 'expired' && <Badge variant="outline">Expired</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {scopeLine(k)}
          {k.riskyTools.length > 0 ? ` · risky tools: ${k.riskyTools.join(', ')}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {showOwner ? `${k.login.displayName || k.login.email || 'Unknown login'} · ` : ''}
          Made {formatDateTime(k.createdAt)}
          {' · '}
          {k.lastUsedAt
            ? `last used ${formatDateTime(k.lastUsedAt)}${showOwner && k.lastUsedIp ? ` from ${k.lastUsedIp}` : ''}`
            : 'not used yet'}
          {' · '}
          {k.expiresAt
            ? `${k.status === 'expired' ? 'expired' : 'expires'} ${formatDateTime(k.expiresAt)}`
            : 'never expires'}
        </p>
      </div>
      {!ended && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive-ink"
          onClick={onRevoke}
          aria-label={`Revoke ${k.name}`}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function NewKeyPanel({
  minted,
  origin,
  onDone,
}: {
  minted: AccessKeyCreated & { name: string };
  origin: string;
  onDone: () => void;
}) {
  const ex = exampleCommands(origin, minted.secret);
  return (
    <div className="space-y-3 border-b border-border bg-primary/5 p-4 md:p-5">
      <p className="text-sm">
        <span className="font-medium">{minted.name}</span> is ready. Copy the key now: it is shown
        only once. Keep it like a password.
      </p>
      <CopyBlock code={minted.secret} />
      <p className="text-xs text-muted-foreground">
        Keep it in a variable, so it stays out of each command:
      </p>
      <CopyBlock code={ex.env} />
      <p className="text-xs text-muted-foreground">Try it:</p>
      <CopyBlock code={ex.http} />
      <p className="text-xs text-muted-foreground">Or add this brain to Claude Code over MCP:</p>
      <CopyBlock code={ex.mcp} />
      <div className="flex justify-end">
        <Button size="sm" onClick={onDone}>
          I copied it
        </Button>
      </div>
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  rules,
  defaultExpiryDays,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: CreateRules;
  defaultExpiryDays: number;
  onCreated: (made: AccessKeyCreated & { name: string }) => Promise<void>;
}) {
  const toast = useToast();
  const { isAdmin } = rules;
  const blank = (): CreateForm => ({
    name: '',
    expiry: defaultExpiryChoice(defaultExpiryDays, rules.maxExpiryDays),
    riskyTools: '',
    password: '',
  });
  const [form, setForm] = useState<CreateForm>(blank);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<CreateForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = createBody(form, rules);
    if ('error' in built) {
      setError({ field: built.field, message: built.error });
      return;
    }
    setError(null);
    setPending(true);
    try {
      const made = await apiSend<AccessKeyCreated>('/api/access-keys', 'POST', built.body);
      await onCreated({ ...made, name: built.body.name });
      setForm(blank());
    } catch (err) {
      // The password is never kept after a try, whatever the answer.
      set({ password: '' });
      // A wrong password is the field's problem, not a toast.
      if (err instanceof ApiError && err.status === 403 && err.body?.reason === 'password') {
        setError({ field: 'password', message: err.message });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Could not make the key');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Closing forgets the whole form, the password above all.
        if (!o) {
          setError(null);
          setForm(blank());
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Make an API key</DialogTitle>
          <DialogDescription>
            The key acts as you. It has the same rights as your login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          {rules.needsPassword && (
            // For a password manager: the login the password field is for, so
            // it does not fill the key's Name instead. Hidden and never
            // focused, so the kit's styling has nothing to do here.
            // eslint-disable-next-line house/no-raw-form-control -- a hidden autofill hint, not a control
            <input type="text" autoComplete="username" hidden readOnly value="" />
          )}
          <FieldGroup>
            <Field data-invalid={error?.field === 'name' || undefined}>
              <FieldLabel htmlFor="key-name">Name</FieldLabel>
              <Input
                id="key-name"
                autoComplete="off"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Backup script"
                aria-invalid={error?.field === 'name' || undefined}
                aria-describedby={error?.field === 'name' ? 'key-name-error' : undefined}
              />
              <FieldError id="key-name-error">
                {error?.field === 'name' ? error.message : null}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="key-expiry">Expires</FieldLabel>
              <Select
                value={form.expiry}
                onValueChange={(v) => set({ expiry: v as CreateForm['expiry'] })}
              >
                <SelectTrigger id="key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expiryChoicesFor(rules.maxExpiryDays).map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXPIRY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {isAdmin && (
              <Field data-invalid={error?.field === 'riskyTools' || undefined}>
                <FieldLabel htmlFor="key-risky">Risky MCP tools allowed</FieldLabel>
                <Input
                  id="key-risky"
                  value={form.riskyTools}
                  onChange={(e) => set({ riskyTools: e.target.value })}
                  placeholder="web_search, email_send"
                  aria-invalid={error?.field === 'riskyTools' || undefined}
                  aria-describedby="key-risky-description"
                />
                <FieldDescription id="key-risky-description">
                  Tools that send, spend or publish stay blocked for a key until you name them here.
                  Leave it empty if you are not sure.
                </FieldDescription>
                <FieldError>{error?.field === 'riskyTools' ? error.message : null}</FieldError>
              </Field>
            )}

            {rules.needsPassword && (
              <Field data-invalid={error?.field === 'password' || undefined}>
                <FieldLabel htmlFor="key-password">Your password</FieldLabel>
                <Input
                  id="key-password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => set({ password: e.target.value })}
                  aria-invalid={error?.field === 'password' || undefined}
                  aria-describedby={error?.field === 'password' ? 'key-password-error' : undefined}
                />
                <FieldError id="key-password-error">
                  {error?.field === 'password' ? error.message : null}
                </FieldError>
              </Field>
            )}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <SubmitButton pending={pending}>Make key</SubmitButton>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
