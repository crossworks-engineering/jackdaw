'use client';

/**
 * Wire-contract handshake (split plan P3). The interface and the brain ship
 * from separate repos on separate version streams; CONTRACT_VERSION is the
 * one number that must AGREE — it only moves on breaking wire changes. When
 * the brain answers /api/version with a different value, every screen is
 * about to fail in some confusing local way (missing fields, dead buttons),
 * so say the real reason once, at the top of the rail, and point at the fix.
 *
 * Renders nothing while loading, on old servers that predate the field, and
 * on fetch failure — unreachable is not incompatible, and the rest of the
 * app already surfaces unreachable loudly.
 */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { CONTRACT_VERSION } from '@mantle/web-ui/version';

// A mismatch cannot fix itself without a roll on one side, and a roll reloads
// the tab — so one check per hour is plenty and keeps the rail quiet.
const RECHECK_MS = 60 * 60 * 1000;

export function ContractBanner({ onNavigate }: { onNavigate?: () => void }) {
  const versionQuery = useQuery({
    queryKey: ['server-version'],
    queryFn: () => apiFetch<{ version?: string; contractVersion?: number }>('/api/version'),
    staleTime: RECHECK_MS,
    refetchInterval: RECHECK_MS,
  });

  const server = versionQuery.data;
  if (typeof server?.contractVersion !== 'number') return null;
  if (server.contractVersion === CONTRACT_VERSION) return null;

  const older = server.contractVersion < CONTRACT_VERSION;
  return (
    <div className="px-3 pt-3 group-data-[nav-collapsed=true]/shell:px-2">
      <Link
        href="/settings/updates"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:px-0 group-data-[nav-collapsed=true]/shell:py-2"
        title={`This interface speaks wire contract v${CONTRACT_VERSION}; the brain (${server.version ? `v${server.version}` : 'unknown version'}) speaks v${server.contractVersion}. Update the ${older ? 'brain' : 'interface'}.`}
      >
        <AlertTriangle className="size-4 shrink-0" />
        <span className="truncate group-data-[nav-collapsed=true]/shell:hidden">
          {older ? 'Brain too old for this interface' : 'Interface too old for this brain'}
        </span>
      </Link>
    </div>
  );
}
