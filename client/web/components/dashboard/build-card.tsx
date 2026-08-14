'use client';

import { useQuery } from '@tanstack/react-query';
import { Server } from 'lucide-react';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mantle/web-ui/ui/card';
import { APP_VERSION, CONTRACT_VERSION, GIT_SHA } from '@mantle/web-ui/version';
import { JackdawBadge } from '@/components/layout/rail/jackdaw-mark';

/**
 * What this install is actually running, both halves of it.
 *
 * Since the repo split the interface and the brain ship from separate repos on
 * separate version streams, so ONE version number can no longer describe the
 * install. This card names each: Jackdaw is the build the browser is running
 * (compiled in, `APP_VERSION`), Mantle is whatever brain answers
 * `GET /api/version` right now. Reading them side by side is the only place a
 * mismatched pair is visible today, which is why the pairing lives on the
 * dashboard rather than buried in /debug.
 *
 * The wire contract is the compatibility number that actually matters (see
 * `CONTRACT_VERSION`): the versions above it can drift freely as long as this
 * agrees. Split-plan P3 turns a disagreement here into a banner; until then
 * this card is the manual check.
 */

type VersionPayload = {
  version?: string;
  contractVersion?: number;
  gitSha?: string | null;
  buildTime?: string | null;
};

export function BuildCard() {
  const versionQuery = useQuery({
    queryKey: ['server-version'],
    queryFn: () => apiFetch<VersionPayload>('/api/version'),
    // Constant for the life of the server build; a roll reloads the tab anyway.
    staleTime: 5 * 60 * 1000,
  });

  const server = versionQuery.data;
  // Three states, and the failure one is explicit on purpose: a brain that is
  // unreachable (down, blocked, wrong origin) must not leave the row sitting on
  // a loading ellipsis that reads like a slow network forever.
  //
  // `paused` counts as unreachable, not as loading. On a network-level failure
  // (DNS, refused, CORS) the fetch rejects without a Response, and TanStack's
  // default `networkMode: 'online'` parks the retry instead of failing it — the
  // query then sits at `pending/paused` indefinitely and never reaches
  // `isError`. Observed exactly that against an origin the brain does not
  // allow; without this branch the row showed "…" forever.
  const unreachable = versionQuery.isError || versionQuery.fetchStatus === 'paused';
  const serverVersion = server?.version ? `v${server.version}` : unreachable ? 'unavailable' : '…';

  // Only flag a real disagreement: absent while loading, or on an older brain
  // that predates the field, is not a mismatch.
  const contractMismatch =
    typeof server?.contractVersion === 'number' && server.contractVersion !== CONTRACT_VERSION;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <JackdawBadge className="size-4" /> Build
        </CardTitle>
        <CardDescription>The interface and the brain it is talking to</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Row
            icon={<JackdawBadge className="size-5" />}
            name="Jackdaw"
            role="interface"
            version={`v${APP_VERSION}`}
          />
          <Row
            icon={<Server className="size-5 text-muted-foreground" aria-hidden />}
            name="Mantle"
            role="brain"
            version={serverVersion}
          />
        </div>
        <div className="border-t pt-3 text-xs text-muted-foreground">
          {contractMismatch ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Wire contract mismatch: this interface speaks v{CONTRACT_VERSION}, the brain speaks v
              {server?.contractVersion}. Update whichever is older.
            </span>
          ) : (
            <>
              Wire contract v{CONTRACT_VERSION}
              {GIT_SHA ? ` · ${GIT_SHA}` : ''}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  icon,
  name,
  role,
  version,
}: {
  icon: React.ReactNode;
  name: string;
  role: string;
  version: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/40">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{role}</span>
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums">{version}</span>
    </div>
  );
}
