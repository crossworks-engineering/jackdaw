'use client';

/**
 * What a peer's token may do on this brain's MCP endpoint (brain migration
 * 0227, "MCP as a login"): act as one login (the owner, a team member or a
 * client) or nobody (a share-only peer), with a Write switch. Bound to the
 * owner, the owner can also allow risky tools by name. Every change saves at
 * once through PATCH /api/peers/:id; the brain checks the login and its role.
 * Binding a peer to the owner may mint a new inbound token; the answer then
 * carries it and the reveal shows it once.
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
import { hasArea } from '@/lib/workspaces';
import { useViewerAreas } from '@/components/workspaces/use-shell-workspaces';
import { revealPatchToken, type PeerPatchAnswer } from './peer-patch';
import {
  ACTS_AS_NEEDS_USERS,
  ACTS_AS_NONE,
  actsAsOptions,
  actsAsValue,
  type ActsAsLogin,
} from './peer-acts-as';

export type PeerAccess = {
  actsAsLoginId: string | null;
  actsAsRole: 'admin' | 'member' | 'client' | null;
  writeEnabled: boolean;
  allowedRiskyTools: string[];
};

export function PeerAccessSection({
  peerId,
  peerName,
  access,
  onChanged,
  onRevealNew,
}: {
  peerId: string;
  peerName: string;
  access: PeerAccess;
  onChanged: (patch: PeerAccess) => void;
  onRevealNew: (token: string) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [risky, setRisky] = useState(access.allowedRiskyTools.join(', '));
  // GET /api/users is open to the `users` area only: without it the list is
  // not asked, and the bound login stays a choice (peer-acts-as.ts).
  const mayListUsers = hasArea(useViewerAreas(), 'users');
  const logins = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<{ users: ActsAsLogin[] }>('/api/users'),
    enabled: mayListUsers,
    retry: false,
  });

  const value = actsAsValue(access);

  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    let saved = false;
    try {
      const answer = await apiSend<PeerPatchAnswer>(`/api/peers/${peerId}`, 'PATCH', body);
      saved = true;
      // Before the reload: the token is shown once, so a failed list read must not lose it.
      const minted = revealPatchToken(answer, onRevealNew);
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
      toast.success(minted ? 'Saved. New inbound token minted' : 'Saved');
    } catch (err) {
      if (saved) toast.error('Saved, but the list could not reload');
      else toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const bound = access.actsAsRole !== null;
  const asOwner = access.actsAsRole === 'admin';
  const options = actsAsOptions(logins.data?.users, access);

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
          onValueChange={(v) => save({ actsAs: v === ACTS_AS_NONE ? null : v })}
        >
          <SelectTrigger size="sm" className="min-w-56" aria-label="Acts as">
            <SelectValue placeholder="Nobody (share only)" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!mayListUsers && <p className="text-xs text-muted-foreground">{ACTS_AS_NEEDS_USERS}</p>}

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
