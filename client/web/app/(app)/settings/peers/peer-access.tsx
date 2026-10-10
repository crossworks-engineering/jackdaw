'use client';

/**
 * What a peer's token may do on this brain's MCP endpoint (brain migration
 * 0227, "MCP as a login"): act as one login (the owner, a team member or a
 * client) or nobody (a share-only peer), with a Write switch. Bound to the
 * owner, the owner can also allow risky tools by name. Every change saves at
 * once through PATCH /api/peers/:id; the brain checks the login and its role.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert, UserRound } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Input } from '@mantle/web-ui/ui/input';
import { Button } from '@mantle/web-ui/ui/button';
import { Switch } from '@mantle/web-ui/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { useToast } from '@mantle/web-ui/ui/toast';

export type PeerAccess = {
  actsAsLoginId: string | null;
  actsAsRole: 'admin' | 'member' | 'client' | null;
  writeEnabled: boolean;
  allowedRiskyTools: string[];
};

type Login = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  disabled?: boolean;
};

const NONE = 'none';
const OWNER = 'owner';

export function PeerAccessSection({
  peerId,
  peerName,
  access,
  onChanged,
}: {
  peerId: string;
  peerName: string;
  access: PeerAccess;
  onChanged: (patch: PeerAccess) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [risky, setRisky] = useState(access.allowedRiskyTools.join(', '));
  const logins = useQuery({
    queryKey: ['mcp-logins'],
    queryFn: () => apiFetch<{ logins: Login[] }>('/api/mcp-logins'),
  });

  const value = access.actsAsRole === 'admin' ? OWNER : (access.actsAsLoginId ?? NONE);

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await apiSend(`/api/peers/${peerId}`, 'PATCH', body);
      const { peers } = await apiFetch<{ peers: (PeerAccess & { id: string })[] }>('/api/peers');
      const p = peers.find((x) => x.id === peerId);
      if (p) {
        onChanged({
          actsAsLoginId: p.actsAsLoginId,
          actsAsRole: p.actsAsRole,
          writeEnabled: p.writeEnabled,
          allowedRiskyTools: p.allowedRiskyTools,
        });
        setRisky(p.allowedRiskyTools.join(', '));
      }
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const bound = access.actsAsRole !== null;
  const asOwner = access.actsAsRole === 'admin';
  const others = (logins.data?.logins ?? []).filter(
    (l) => (l.role === 'member' || l.role === 'client') && !l.disabled,
  );

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="inline-flex items-center gap-2 text-sm font-medium">
        <UserRound className="size-4" /> MCP access
      </p>
      <p className="text-xs text-muted-foreground">
        With <span className="font-medium text-foreground">Acts as</span> set, {peerName} can use
        its token on this brain&apos;s MCP endpoint, with exactly that login&apos;s rights. Remote
        MCP must be on (Settings, MCP). Changing Acts as turns Write off again.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Acts as</span>
        <Select
          value={value}
          disabled={saving}
          onValueChange={(v) => save({ actsAs: v === NONE ? null : v })}
        >
          <SelectTrigger size="sm" className="min-w-56" aria-label="Acts as">
            <SelectValue placeholder="Nobody (share only)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nobody (share only)</SelectItem>
            <SelectItem value={OWNER}>Owner (admin)</SelectItem>
            {others.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {(l.displayName || l.email) + (l.role === 'client' ? ' (client)' : ' (member)')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {bound && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">Write</p>
              <p className="text-xs text-muted-foreground">
                {asOwner
                  ? 'Off: read only. On: it can create, change, move and delete content here (notes, events, files, folders, pages, tables), but not the risky tools below.'
                  : 'Off: read only. On: it can create drafts in that login’s own space, for review.'}
              </p>
            </div>
            <Switch
              checked={access.writeEnabled}
              disabled={saving}
              onCheckedChange={(v) => save({ writeEnabled: v })}
              aria-label="Allow write"
            />
          </div>
          {access.writeEnabled && asOwner && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {peerName} can now change this brain as you. Turn this on only for a brain you own and
              trust.
            </p>
          )}
          {asOwner && (
            <div className="space-y-1.5">
              <p className="text-sm">Risky tools allowed</p>
              <p className="text-xs text-muted-foreground">
                Blocked unless named here: email and Telegram sends, sandboxes, web access, app
                publish, shares, the shell, and anything that spends. Comma list of tool names.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={risky}
                  onChange={(e) => setRisky(e.target.value)}
                  placeholder="e.g. web_search"
                  disabled={saving}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() =>
                    save({
                      allowedRiskyTools: risky
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
