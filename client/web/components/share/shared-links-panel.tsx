'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Link2, Link2Off } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
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
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useToast } from '@mantle/web-ui/ui/toast';
import { apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { serverUrl } from '@mantle/web-ui/runtime-env';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';

/** One active link from GET /api/team-admin/shares. Every link is open
 *  (anyone with it can view): team links are retired (member logins Phase 6
 *  stage 6), so the row's share `mode` is always 'public' and is not read. */
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
};

/** The Shared links tab's query (GET /api/team-admin/shares). */
export const SHARES_KEY = ['team-admin', 'shares'] as const;

type SharesData = { shares: SharedLinkRow[] };

const TYPE_LABEL: Record<string, string> = {
  page: 'Page',
  note: 'Note',
  task: 'Task',
  event: 'Event',
  file: 'File',
  app: 'App',
  table: 'Table',
  formula: 'Formula',
  branch: 'Folder',
};

/**
 * The owner's exposure registry: every active share link, newest first. One
 * glance answers "what can people outside see right now?". A link is always
 * open: members read team items by level with their own logins, not by link.
 *
 * Master-detail: the links as cards on the left, and the SELECTED link's real
 * `/s/…` page framed on the right. The preview is the server surface itself,
 * so it shows exactly what a visitor gets. Copy, open and revoke live in the
 * detail header. The rows are the tab's query, not a copy of it: a revoke
 * takes the link out of that query at once and then refetches it, so a
 * revoked link cannot come back on the next tab switch, and a later refetch
 * always shows.
 */
export function SharedLinksPanel({ rows }: { rows: SharedLinkRow[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const [confirmRevoke, setConfirmRevoke] = useState<SharedLinkRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

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
      await apiSend(`/api/shares/${confirmRevoke.id}`, 'DELETE');
      const gone = confirmRevoke.id;
      queryClient.setQueryData<SharesData>(SHARES_KEY, (d) =>
        d ? { ...d, shares: d.shares.filter((x) => x.id !== gone) } : d,
      );
      void queryClient.invalidateQueries({ queryKey: SHARES_KEY });
      toast.success(`Unshared "${confirmRevoke.title}"`);
      setConfirmRevoke(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast.error(e instanceof Error ? e.message : 'Could not revoke the link');
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center text-sm text-muted-foreground">
          <p>Nothing is shared right now.</p>
          <p className="mt-1">
            Use the Share button on any page, note, table, app, task, event, file, or folder.
          </p>
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
                        {TYPE_LABEL[row.nodeType] ?? row.nodeType}
                        {row.cascade ? ' · sub-pages included' : ''} · {row.viewCount} view
                        {row.viewCount === 1 ? '' : 's'}
                        {row.lastViewedAt ? `, last ${formatDate(row.lastViewedAt)}` : ''}
                      </ListCardMeta>
                    </ListCard>
                  </li>
                ))}
              </ul>
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
                      {TYPE_LABEL[selected.nodeType] ?? selected.nodeType}
                      {selected.cascade ? ' · sub-pages included' : ''} · shared{' '}
                      {formatDate(selected.createdAt)} · {selected.viewCount} view
                      {selected.viewCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void copy(selected)}
                      aria-label="Copy link"
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
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

      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRevoke?.cascade
                ? `"${confirmRevoke?.title}" and its shared sub-pages stop being accessible immediately. The content itself is untouched.`
                : `"${confirmRevoke?.title}" stops being accessible immediately. The content itself is untouched.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep sharing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
              disabled={busy}
            >
              Revoke link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
