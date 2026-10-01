'use client';

/**
 * Team admin > Review (member logins Phase 4, plan v3.1 section 6): what
 * members and clients submitted for review, oldest first (a client's item
 * wears the Client badge, client logins C1 and C5), and what deactivated logins
 * left shared with the team. The detail pane shows the item's SAVED version
 * read-only (a submitted item is frozen), its thread, and the actions:
 * Accept into the brain, Return with a note, Take over (into the admin's own
 * private items, audit F07), or (left behind only) Discard.
 *
 * Owner-only screen over /api/team-admin/submissions. A private item never
 * reaches it: the brain answers one with a plain 404.
 */
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { ClipboardCheck, Trash2, Unlock, UserX } from 'lucide-react';
import { Badge } from '@mantle/web-ui/ui/badge';
import { Button } from '@mantle/web-ui/ui/button';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { PageView } from '@/components/page-editor/page-view';
import {
  QUEUE_KEY,
  authorRoleLabel,
  canTakeOver,
  commentsKey,
  isReleased,
  itemKey,
  memberReview,
  reviewCommentsOpen,
  reviewAssetPath,
  reviewBytesPath,
  reviewErrorMessage,
  reviewSvgPath,
  splitQueue,
  type ReviewItem,
  type ReviewItemRow,
} from '@/lib/member-review';
import type { SpaceComment } from '@/lib/member-space';
import { useThreadPages } from '@/lib/use-thread-pages';
import { AcceptDialog, DiscardDialog, ReturnDialog, TakeOverDialog } from './review-dialogs';

const KIND_LABEL: Record<ReviewItemRow['type'], string> = {
  page: 'Page',
  note: 'Note',
  draw: 'Drawing',
  table: 'Table',
  file: 'File',
};

/** A client author's badge (client logins C1): "Client". A member's item,
 *  the queue's usual row, wears none. */
function ClientAuthorBadge({ row }: { row: ReviewItemRow }) {
  if (row.author.role !== 'client') return null;
  return (
    <Badge variant="secondary" className="ml-1.5 align-middle" title="Written by a client">
      {authorRoleLabel(row.author.role)}
    </Badge>
  );
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The queue, shared by the tab badge and the list (one request). */
export function useReviewQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: memberReview.queue,
    // The needs-you live event refreshes this (use-needs-you.ts); the poll
    // is the safety net for a change missed during a reconnect.
    refetchInterval: 60_000,
  });
}

function QueueSection({
  title,
  rows,
  selectedId,
  hint,
}: {
  title: string;
  rows: ReviewItemRow[];
  selectedId: string | null;
  hint?: string;
}) {
  if (!rows.length) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2 p-3">
      <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title} <span className="font-normal">{rows.length}</span>
      </h3>
      {hint ? <p className="px-1 text-xs text-muted-foreground">{hint}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <ListCard asChild selected={r.id === selectedId}>
              <Link href={`/team-admin?view=review&item=${r.id}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <ListCardTitle>{r.title || 'Untitled'}</ListCardTitle>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtWhen(r.submittedAt ?? r.updatedAt)}
                  </span>
                </div>
                <ListCardMeta>
                  {KIND_LABEL[r.type]} · {r.author.name}
                  {r.author.inactive ? ' · deactivated' : ''}
                  {isReleased(r) ? ' · released' : ''}
                  <ClientAuthorBadge row={r} />
                </ListCardMeta>
              </Link>
            </ListCard>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReviewPanel({ itemId }: { itemId?: string }) {
  const q = useReviewQueue();
  if (q.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm">
        <p className="text-muted-foreground">Could not load the review queue.</p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!q.data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const items = q.data.items;
  const { submitted, leftBehind } = splitQueue(items);
  const selectedId = itemId && items.some((i) => i.id === itemId) ? itemId : (items[0]?.id ?? null);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  return (
    <MasterDetail
      id="team-admin-review"
      className="min-h-0 flex-1"
      defaultListSize="340px"
      defaultDetailSize="768px"
      maxDetailSize="100%"
      list={
        <>
          <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Review</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Nothing waits for review. When a member or a client submits an item, it shows here.
              </div>
            ) : (
              <>
                <QueueSection title="Waiting for review" rows={submitted} selectedId={selectedId} />
                <QueueSection
                  title="Left behind"
                  rows={leftBehind}
                  selectedId={selectedId}
                  hint="Shared with the team by logins that are now deactivated. Accept or discard."
                />
              </>
            )}
          </div>
        </>
      }
      detail={
        selected ? (
          <ReviewDetail key={selected.id} row={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <ClipboardCheck className="mx-auto mb-2 size-6" />
              <p>A submitted item shows here, read-only, with its review thread.</p>
            </div>
          </div>
        )
      }
    />
  );
}

function ReviewDetail({ row }: { row: ReviewItemRow }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: itemKey(row.id), queryFn: () => memberReview.item(row.id) });
  const done = useCallback(() => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY });
  }, [qc]);
  const waiting = row.reason === 'submitted';
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{row.title || 'Untitled'}</h2>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[row.type]} by {row.author.name}
            {row.author.email ? ` (${row.author.email})` : ''}
            {row.submittedAt ? ` · submitted ${fmtWhen(row.submittedAt)}` : ''}
            {row.sharing === 'team' ? ' · shared with the team' : ''}
            <ClientAuthorBadge row={row} />
          </p>
          {row.author.inactive ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserX className="size-3.5" /> This login is deactivated.
            </p>
          ) : null}
          {isReleased(row) ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Unlock className="size-3.5 shrink-0" aria-hidden /> Released: the admin who took this
              over is no longer an admin, so it is back here with what was taken with it.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <AcceptDialog row={row} onDone={done} />
          {waiting ? <ReturnDialog row={row} onDone={done} /> : null}
          {canTakeOver(row) ? <TakeOverDialog row={row} onDone={done} /> : null}
          {row.author.inactive ? <DiscardDialog row={row} onDone={done} /> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex w-full flex-col gap-4 p-4">
          {q.isError ? (
            <p className="text-sm text-muted-foreground">
              {reviewErrorMessage(q.error, 'Could not load this item.')}
            </p>
          ) : !q.data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <ReviewItemView item={q.data} />
              <ReviewThread id={row.id} item={q.data} canWrite={reviewCommentsOpen(row)} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** The saved version, read-only, through the same presenters the member
 *  reader uses; every byte comes from the submission's own routes. */
function ReviewItemView({ item }: { item: ReviewItem }) {
  const asset = useAssetUrl();
  const { row, body } = item;
  const mapAsset = useCallback((p: string) => reviewAssetPath(row.id, p), [row.id]);
  switch (body.type) {
    case 'page':
      return (
        <PageView
          content={body.page.doc as JSONContent}
          mapAssetPath={mapAsset}
          folderId={(body.page as { folderId?: string | null }).folderId}
          // Before Accept the draft may sit in its author's own folder, which
          // the owner tree does not hold: the block then shows its label alone.
          quietHere
        />
      );
    case 'note':
      return (
        <NotePresenter view={{ title: row.title, content: body.note.content }} chrome="embedded" />
      );
    case 'draw':
      return (
        <DrawPresenter
          view={{ title: row.title, hasSvg: true }}
          src={asset(reviewSvgPath(row.id))}
          chrome="embedded"
        />
      );
    case 'table':
      return (
        <TablePresenter
          view={{ title: row.title, icon: row.icon, tabs: null, legacyDoc: body.table.data }}
          token=""
          chrome="embedded"
        />
      );
    case 'file':
      return (
        <FilePresenter
          view={{
            fileId: row.id,
            filename: body.file.filename,
            mimeType: body.file.mimeType,
            size: body.file.sizeBytes,
          }}
          assetUrl={() => asset(reviewBytesPath(row.id))}
          chrome="embedded"
        />
      );
  }
}

/** The review talk: the author and the reviewers. Teammates never read it. */
function ReviewThread({ id, item, canWrite }: { id: string; item: ReviewItem; canWrite: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: itemKey(id) });
  // Read a page at a time (the newest 100, then Load older); the item's own
  // answer carries the talk too, which shows until the first page is read
  // (and on a brain whose talk route fails).
  const thread = useThreadPages<SpaceComment>({
    queryKey: commentsKey(id),
    path: memberReview.commentsPath(id),
  });
  const add = useMutation({
    mutationFn: () => memberReview.addComment(id, text),
    onSuccess: () => {
      setText('');
      refresh();
      composer.current?.focus();
    },
    onError: (err) => toast.error(reviewErrorMessage(err, 'Could not post the comment.')),
  });
  const del = useMutation({
    mutationFn: (commentId: string) => memberReview.deleteComment(id, commentId),
    onSuccess: () => {
      refresh();
      composer.current?.focus();
    },
    onError: (err) => toast.error(reviewErrorMessage(err, 'Could not delete the comment.')),
  });
  const comments = thread.query.data ? thread.comments : item.comments;
  return (
    <section className="space-y-3 border-t border-border pt-4" aria-label="Review comments">
      <div>
        <h3 className="text-sm font-semibold">Review comments</h3>
        <p className="text-xs text-muted-foreground">
          Between the author and the admins. Teammates never see these.
        </p>
      </div>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {thread.query.data && thread.hasMore ? (
            <li className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={thread.loadingOlder}
                onClick={thread.loadOlder}
              >
                Load older
              </Button>
            </li>
          ) : null}
          {comments.map((c) => (
            <li key={c.id} className="group/comment rounded-md bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.authorName}</span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
                {c.mine ? (
                  <Button
                    variant="ghost"
                    size="icon-2xs"
                    className="ml-auto opacity-60 group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
                    aria-label="Delete comment"
                    disabled={del.isPending}
                    onClick={() => del.mutate(c.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) add.mutate();
          }}
        >
          <Textarea
            ref={composer}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply to the author…"
            aria-label="Reply to the author"
            rows={2}
            maxLength={10_000}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!text.trim() || add.isPending}>
              Comment
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
