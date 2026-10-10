'use client';

/**
 * What a peer's token may do on this brain's MCP endpoint (brain migration
 * 0227, "MCP as a login"): act as one login (the owner, a team member or a
 * client) or nobody (a share-only peer). A bound peer acts exactly as that
 * login (workspaces W5b2, contract 26): the brain ignores the old Write
 * switch and risky-tool list, so they are gone from here. A change saves at
 * once through PATCH /api/peers/:id; the brain checks the login and its role.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
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
};

/** What the section says: a bound peer has its login's rights, no more and
 *  no less. */
export const PEER_ACTS_AS_TEXT =
  'It acts exactly as that login: it reads and changes what that login may, nothing more.';

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
        onChanged({ actsAsLoginId: p.actsAsLoginId, actsAsRole: p.actsAsRole });
      }
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const bound = access.actsAsRole !== null;
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
        its token on this brain&apos;s MCP endpoint. Remote MCP must be on (Settings, MCP).
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

      {bound && <p className="text-xs text-muted-foreground">{PEER_ACTS_AS_TEXT}</p>}
    </div>
  );
}
