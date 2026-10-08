'use client';

/**
 * Team and client MCP access (brain migration 0227, "MCP as a login"). Per
 * member or client login: MCP on or off, and Write on or off. A login with MCP on
 * signs in from Claude with OAuth, or uses an API key it makes itself in
 * Settings > API access: it then gets its own role's tools, at its own level.
 *
 * Admin-made static tokens (`mtlmcpk_`) are retired (2026-10-07: nobody
 * makes a credential for another login). Tokens made before still work;
 * they are listed here and can be revoked, and no new one can be made.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { KeyRound, Loader2, Trash2, Users } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Switch } from '@mantle/web-ui/ui/switch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';

type LoginToken = { id: string; label: string; createdAt: string; lastUsedAt: string | null };
type McpLogin = {
  id: string;
  email: string;
  displayName: string | null;
  role: 'member' | 'client';
  disabled: boolean;
  enabled: boolean;
  writeEnabled: boolean;
  tokens: LoginToken[];
};

export function McpLoginsSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['mcp-logins'],
    queryFn: () => apiFetch<{ logins: McpLogin[] }>('/api/mcp-logins'),
  });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['mcp-logins'] });

  const patch = async (id: string, body: { enabled?: boolean; writeEnabled?: boolean }) => {
    setBusy(id);
    try {
      await apiSend(`/api/mcp-logins/${id}`, 'PATCH', body);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string, tokenId: string) => {
    setBusy(id);
    try {
      await apiSend(`/api/mcp-logins/${id}/tokens/${tokenId}`, 'DELETE');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not revoke');
    } finally {
      setBusy(null);
    }
  };

  const logins = query.data?.logins ?? [];

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4 md:p-5">
        <div className="mt-0.5 rounded-lg bg-accent p-2 text-accent-foreground">
          <Users className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Team and client access</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Let a member or client use Claude on this brain, with their own rights only. Read only
            unless you turn Write on: then they can make drafts in their own space, for review, and
            change rows in the mini apps you open to MCP (MCP access on the app). They sign in from
            Claude with the connector URL above, or make their own key in{' '}
            <Link href="/settings/api-access" className="underline underline-offset-2">
              API access
            </Link>
            .
          </p>
        </div>
      </div>
      {query.isLoading ? (
        <div className="p-4 text-sm text-muted-foreground md:p-5">Loading…</div>
      ) : query.isError ? (
        <div className="p-4 text-sm text-destructive-ink md:p-5">Could not load the logins.</div>
      ) : logins.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground md:p-5">
          No member or client logins yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {logins.map((l) => (
            <li key={l.id} className="space-y-3 p-4 md:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.displayName || l.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.role === 'client' ? 'Client' : 'Team member'}
                    {l.displayName ? ` · ${l.email}` : ''}
                    {l.disabled ? ' · disabled' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {busy === l.id && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    MCP
                    <Switch
                      checked={l.enabled}
                      disabled={busy === l.id}
                      onCheckedChange={(v) => patch(l.id, { enabled: v })}
                      aria-label={`MCP access for ${l.email}`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Write
                    <Switch
                      checked={l.writeEnabled}
                      disabled={busy === l.id || !l.enabled}
                      onCheckedChange={(v) => patch(l.id, { writeEnabled: v })}
                      aria-label={`Write drafts and app data for ${l.email}`}
                    />
                  </label>
                </div>
              </div>

              {l.tokens.length > 0 && (
                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <p className="inline-flex items-center gap-2 text-xs font-medium">
                    <KeyRound className="size-3.5" /> Tokens made before API keys
                  </p>
                  <ul className="space-y-1">
                    {l.tokens.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          {t.label} · made {formatDateTime(t.createdAt)}
                          {t.lastUsedAt
                            ? ` · last used ${formatDateTime(t.lastUsedAt)}`
                            : ' · not used yet'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive-ink"
                          disabled={busy === l.id}
                          onClick={() => revoke(l.id, t.id)}
                          aria-label={`Revoke ${t.label}`}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    These still work. New tokens are not made here: {l.displayName || l.email} makes
                    their own key in API access.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
