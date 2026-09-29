'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessLevel } from '@mantle/client-types';
import { Check, Copy, ExternalLink, Link2, Link2Off } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { serverUrl } from '@mantle/web-ui/runtime-env';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import { isOldClientLink, kindLabel, linkLevels } from '@/lib/access-levels';
import {
  LEVELS_FAILED,
  SHARES_KEY,
  SHARE_LEVELS_KEY,
  canCopyLink,
  needsLevelLookup,
  revokeShareLink,
} from '@/lib/shared-links';
import type { RetiredClientLinkRow } from '@/lib/contract-next';
import type { SharedLinkRow as AllSharesRow } from '@mantle/client-types';
import { LinkLevel } from './link-level';
import { RetiredClientLinks } from './retired-client-links';
import { RevokeLinkDialog, STAYS_AT_CLIENT } from './revoke-link-dialog';

export { SHARES_KEY };

/** One active link from GET /api/team-admin/shares. Every link is open
 *  (anyone with it can view): team links are retired (member logins Phase 6
 *  stage 6), so the row's share `mode` is always 'public' and is not read.
 *  `level` is the item's level: on the row itself on a current brain;
 *  otherwise it comes from GET /api/shares/all (client logins C1), and on a
 *  brain before C1 it is absent and nothing extra shows. */
export type SharedLinkRow = {
  id: string;
  path: string;
  nodeId: string;
  nodeType: string;
  title: string;
  icon: string | null;
  cascade: boolean;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  level?: AccessLevel;
};

type SharesData = { shares: SharedLinkRow[] };

/**
 * The owner's exposure registry: every active share link, newest first. One
 * glance answers "what can people outside see right now?". A link is always
 * open: members read team items by level with their own logins, not by link.
 * Each link shows its item's level; a live link on a client item is an OLD
 * client link (client logins C1: clients will sign in instead), marked so.
 * Client logins C3 retired those (brain migration 0192), so on a C3 brain
 * every live link is public and none is marked; the retired ones are listed
 * below the live links (RetiredClientLinks), with no copy and no open.
 *
 * Master-detail: the links as cards on the left, and the SELECTED link's real
 * `/s/…` page framed on the right. The preview is the server surface itself,
 * so it shows exactly what a visitor gets. Copy, open and revoke live in the
 * detail header. The rows are the tab's query, not a copy of it: a revoke
 * takes the link out of that query at once and then refetches it, so a
 * revoked link cannot come back on the next tab switch, and a later refetch
 * always shows.
 */
export function SharedLinksPanel({
  rows,
  retired = [],
  initialSelectedId,
}: {
  rows: SharedLinkRow[];
  /** The old client links the brain retired (C3); none from an older brain. */
  retired?: readonly RetiredClientLinkRow[];
  /** Open at this link (`?share=` from "What clients see"). */
  initialSelectedId?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(
    rows.find((r) => r.id === initialSelectedId)?.id ?? rows[0]?.id ?? null,
  );
  const [confirmRevoke, setConfirmRevoke] = useState<SharedLinkRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // A current brain puts the level on every row: no second call. An older
  // one does not, and then /api/shares/all has it (a brain before C1: no
  // level anywhere, nothing extra shows). A failure says so, with Retry,
  // rather than dropping every badge in silence.
  const lookup = needsLevelLookup(rows);
  const levelsQuery = useQuery({
    queryKey: SHARE_LEVELS_KEY,
    queryFn: () => apiFetch<{ shares: AllSharesRow[] }>('/api/shares/all'),
    enabled: lookup,
    retry: false,
  });
  const levels = linkLevels(levelsQuery.data?.shares);
  const levelOf = (row: SharedLinkRow): AccessLevel | undefined => row.level ?? levels.get(row.id);
  const levelsFailed = lookup && levelsQuery.isError;

  // Keep the selection on a live row: a revoke (or a refetch) must not leave
  // the preview on a link that no longer exists.
  useEffect(() => {
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const copy = async (row: SharedLinkRow) => {
    try {
      // Same origin fix as AccessControl: /s/… is the server tier’s surface.
      await navigator.clipboard.writeText(serverUrl(row.path));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const revoke = async () => {
    if (!confirmRevoke) return;
    setBusy(true);
    try {
      await revokeShareLink(confirmRevoke.id);
      const gone = confirmRevoke.id;
      queryClient.setQueryData<SharesData>(SHARES_KEY, (d) =>
        d ? { ...d, shares: d.shares.filter((x) => x.id !== gone) } : d,
      );
      void queryClient.invalidateQueries({ queryKey: SHARES_KEY });
      // The levels behind the badges, on a brain that sends them apart.
      void queryClient.invalidateQueries({ queryKey: SHARE_LEVELS_KEY });
      toast.success(`Unshared "${confirmRevoke.title}"`);
      setConfirmRevoke(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not revoke the link');
    } finally {
      setBusy(false);
    }
  };

  const nothingShared = (
    <div className="text-center text-sm text-muted-foreground">
      <p>Nothing is shared right now.</p>
      <p className="mt-1">
        Use the Share button on any page, note, table, app, task, event, file, or folder.
      </p>
    </div>
  );

  if (rows.length === 0 && retired.length === 0) {
    return <div className="flex flex-1 items-center justify-center p-8">{nothingShared}</div>;
  }

  // No live link, but links C3 retired: the empty note, and those below it.
  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-xl space-y-8 px-4 py-8">
          {nothingShared}
          <RetiredClientLinks rows={retired} />
        </div>
      </div>
    );
  }

  return (
    <>
      <MasterDetail
        id="team-admin-shares"
        className="min-h-0 flex-1"
        defaultListSize="340px"
        defaultDetailSize="768px"
        maxDetailSize="100%"
        list={
          <>
            <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Shared links</h2>
              <span className="text-xs text-muted-foreground">{rows.length}</span>
            </div>
            {levelsFailed ? (
              <p
                role="status"
                className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
              >
                {LEVELS_FAILED}
                <Button
                  size="2xs"
                  variant="outline"
                  disabled={levelsQuery.isFetching}
                  onClick={() => void levelsQuery.refetch()}
                >
                  Retry
                </Button>
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <ul className="flex flex-col gap-2 p-3">
                {rows.map((row) => (
                  <li key={row.id}>
                    <ListCard
                      selected={row.id === selectedId}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {row.icon ? <span aria-hidden>{row.icon}</span> : null}
                          <ListCardTitle>{row.title}</ListCardTitle>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </span>
                      </div>
                      <ListCardMeta>
                        {kindLabel(row.nodeType)}
                        {row.cascade ? ' · sub-pages included' : ''} · {row.viewCount} view
                        {row.viewCount === 1 ? '' : 's'}
                        {row.lastViewedAt ? `, last ${formatDate(row.lastViewedAt)}` : ''}
                      </ListCardMeta>
                      <LinkLevel level={levelOf(row)} />
                    </ListCard>
                  </li>
                ))}
              </ul>
              {retired.length > 0 ? (
                <div className="border-t border-border p-3">
                  <RetiredClientLinks rows={retired} />
                </div>
              ) : null}
            </div>
          </>
        }
        detail={
          <section className="flex h-full min-h-0 flex-col">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      {selected.icon ? <span aria-hidden>{selected.icon}</span> : null}
                      <span className="truncate">{selected.title}</span>
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {kindLabel(selected.nodeType)}
                      {selected.cascade ? ' · sub-pages included' : ''} · shared{' '}
                      {formatDate(selected.createdAt)} · {selected.viewCount} view
                      {selected.viewCount === 1 ? '' : 's'}
                    </p>
                    <div className="mt-1">
                      <LinkLevel level={levelOf(selected)} />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {/* An old client link is not handed out any more: clients
                        sign in. It can still be opened and revoked. */}
                    {canCopyLink(levelOf(selected)) ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => void copy(selected)}
                        aria-label="Copy link"
                      >
                        {copied ? <Check /> : <Copy />}
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      asChild
                      aria-label="Open link"
                    >
                      <Link href={selected.path} target="_blank" rel="noopener">
                        <ExternalLink />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive-ink"
                      onClick={() => setConfirmRevoke(selected)}
                      aria-label="Revoke link"
                    >
                      <Link2Off />
                    </Button>
                  </div>
                </div>
                {/* The share surface itself, framed: what a visitor actually
                    sees at this link. Keyed so a selection change remounts
                    rather than pushing iframe history. */}
                <iframe
                  key={selected.id}
                  src={serverUrl(selected.path)}
                  title={`Share preview — ${selected.title}`}
                  className="min-h-0 w-full flex-1 border-0 bg-background"
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center text-sm text-muted-foreground">
                  <Link2 className="mx-auto mb-2 size-6" />
                  <p>Select a link to preview what it shows.</p>
                </div>
              </div>
            )}
          </section>
        }
      />

      <RevokeLinkDialog
        target={
          confirmRevoke
            ? {
                shareId: confirmRevoke.id,
                title: confirmRevoke.title,
                cascade: confirmRevoke.cascade,
                stays: isOldClientLink(levelOf(confirmRevoke)) ? STAYS_AT_CLIENT : null,
              }
            : null
        }
        busy={busy}
        onCancel={() => setConfirmRevoke(null)}
        onConfirm={() => void revoke()}
      />
    </>
  );
}
