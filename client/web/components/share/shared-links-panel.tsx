'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Link2, Link2Off, Users } from 'lucide-react';
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

export type SharedLinkRow = {
  id: string;
  path: string;
  nodeId: string;
  nodeType: string;
  title: string;
  icon: string | null;
  mode: 'public' | 'team';
  cascade: boolean;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
};

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

function TeamPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
      <Users className="size-2.5" aria-hidden /> team
    </span>
  );
}

/**
 * The owner's exposure registry: every active share link (public and team),
 * newest first — one glance answers "what can people outside see right now?".
 *
 * Master-detail: the links as cards on the left, and the SELECTED link's real
 * `/s/…` page framed on the right — the preview is the server surface itself,
 * so it shows exactly what a visitor gets, team SSO gate included. Copy, open
 * and revoke live in the detail header; revocation updates locally.
 */
export function SharedLinksPanel({ initial }: { initial: SharedLinkRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [confirmRevoke, setConfirmRevoke] = useState<SharedLinkRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep the selection on a live row — a revoke (or a parent refetch swapping
  // `initial`) must not leave the preview on a link that no longer exists.
  useEffect(() => {
    if (selectedId && rows.some((r) => r.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const copy = async (row: SharedLinkRow) => {
    try {
      // Same origin fix as ShareControl: /s/… is the server tier's surface.
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
      setRows((r) => r.filter((x) => x.id !== confirmRevoke.id));
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
                          {row.mode === 'team' && <TeamPill />}
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
                      {selected.mode === 'team' && <TeamPill />}
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
                      <Link href={selected.path} target="_blank">
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
                {/* The share surface itself, framed — what a visitor actually
                    sees at this link, team SSO gate included. Keyed so a
                    selection change remounts rather than pushing iframe
                    history. */}
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
