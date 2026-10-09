'use client';

/**
 * A member's item in its own workspace (workspace review pattern, part 2,
 * 2026-10-09): Pages, Notes, Tables, Draw and Files each show "Waiting for
 * approval" above their tree (`ItemReviewSections`), and a picked row opens
 * in the workspace's detail pane (`ItemReview`), beside the tree, under ONE
 * header the same height as that workspace's normal item header: the title
 * and at most a small state badge, the worded actions (Approve, Reject, Take
 * over, Discard) on the left, the icon-only group (Info, Focus) on the right.
 * Who sent it and when sit behind Info. No banner, no second header row, no
 * comments. Replaces Team admin > Review.
 *
 * Below it, "Shared by members" (Jason 2026-10-09, option 1): what active
 * members shared with the team, opening in the same pane, read only, with
 * Unshare (back to private, nothing deleted). It hides on a brain without
 * the route.
 *
 * The body is the SAVED version, read only, through the presenters the
 * member reader uses; every byte comes from the item's own admin routes
 * (/api/team-admin/submissions or /api/team-admin/member-items, admin only,
 * the shared ones read at team level). A private item never reaches this
 * screen: the brain answers it with a plain 404.
 */
import { useCallback, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { ClipboardCheck, Unlock, UserMinus, UserX } from 'lucide-react';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Badge } from '@mantle/web-ui/ui/badge';
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
  AlertDialogTrigger,
} from '@mantle/web-ui/ui/alert-dialog';
import { useToast } from '@mantle/web-ui/ui/toast';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { cn } from '@mantle/web-ui/lib/utils';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { HeaderInfoButton } from '@/components/app-nav/app-item-header';
import { FocusToggle } from '@/components/layout/focus-toggle';
import { PageReadWithOutline } from '@/components/page-editor/page-read-with-outline';
import { ReaderNote } from '@/components/member/reader-note';
import { ItemIcon } from '@/components/item-list/item-card';
import { noteAssetPath } from '@/lib/note-media';
import {
  QUEUE_KEY,
  authorRoleLabel,
  canTakeOver,
  isReleased,
  itemKey,
  memberReview,
  reviewAssetPath,
  reviewBytesPath,
  reviewErrorMessage,
  reviewSvgPath,
  type ReviewItem,
  type ReviewItemRow,
} from '@/lib/member-review';
import { MEMBER_KIND } from '@/lib/member-kinds';
import type { SpaceItemBody, SpaceKind } from '@/lib/member-space';
import {
  SHARED_ITEMS_KEY,
  SHARED_UNSHARED_TOAST,
  SHARED_UNSHARE_HINT,
  isLeftBehind,
  reviewInfoLine,
  reviewRowMeta,
  reviewRowsOf,
  reviewStateBadge,
  sharedInfoLine,
  sharedItemPath,
  sharedItemsPath,
  sharedRowMeta,
  unshareConfirm,
  type SharedItemAuthor,
  type SharedMemberItem,
} from '@/lib/workspace-review';
import { WorkspaceReviewSections, type ReviewSectionRow } from './workspace-review-sections';
import { AcceptDialog, DiscardDialog, RejectDialog, TakeOverDialog } from './review-dialogs';

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The queue, one request for every workspace and the Team admin links. The
 *  needs-you live event refreshes it (use-needs-you.ts); the poll is the
 *  safety net for a change missed during a reconnect. */
export function useReviewQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: memberReview.queue,
    refetchInterval: 60_000,
  });
}

/** "Shared by members" for one kind; null on a brain without the route. */
export function useSharedItems(kind: SpaceKind) {
  return useQuery({
    queryKey: [...SHARED_ITEMS_KEY, kind],
    queryFn: async (): Promise<SharedMemberItem[] | null> => {
      try {
        return (await apiFetch<{ items: SharedMemberItem[] }>(sharedItemsPath(kind))).items;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    refetchInterval: 60_000,
  });
}

/**
 * The sections above a workspace's tree: "Waiting for approval" (this
 * kind's rows of the queue) and "Shared by members" (what active members
 * shared with the team), each opening in the workspace's own pane
 * (`onSelect`); `selectedId` is the row shown there. Each hides while
 * empty, and on a failed read (the tree stays the screen).
 */
export function ItemReviewSections({
  kind,
  selectedId,
  onSelect,
}: {
  kind: SpaceKind;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const q = useReviewQueue();
  const sharedQ = useSharedItems(kind);
  const shared: ReviewSectionRow[] = (sharedQ.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    onSelect: () => onSelect(r.id),
    lead: <ItemIcon emoji={r.icon ?? MEMBER_KIND[kind].icon} fallback={null} />,
    meta: sharedRowMeta(r, fmtWhen(r.updatedAt)),
  }));
  const rows: ReviewSectionRow[] = reviewRowsOf(q.data?.items, kind).map((r) => {
    const state = reviewStateBadge(r) ?? (r.author.role === 'client' ? 'Client' : null);
    return {
      id: r.id,
      title: r.title,
      onSelect: () => onSelect(r.id),
      lead: <ItemIcon emoji={r.icon ?? MEMBER_KIND[kind].icon} fallback={null} />,
      badge: state ? <Badge variant="secondary">{state}</Badge> : undefined,
      meta: reviewRowMeta(r, fmtWhen(r.submittedAt ?? r.updatedAt)),
    };
  });
  return <WorkspaceReviewSections waiting={rows} shared={shared} selectedId={selectedId} />;
}

/**
 * How each workspace draws its normal item header, so the review header is
 * the same height (an e2e measures both). `inline`: Pages and Draw put the
 * header row inside the padded preview; the others draw a bar with a rule.
 */
const HEADER_LOOK: Record<
  SpaceKind,
  { inline: boolean; bar: string; title: string; body: string }
> = {
  page: { inline: true, bar: 'px-6 pt-6', title: 'text-xl', body: 'p-6 pt-4' },
  draw: { inline: true, bar: 'px-6 pt-6', title: 'text-xl', body: 'p-6 pt-4' },
  note: {
    inline: false,
    bar: 'sticky top-0 z-10 bg-background/60 px-6 py-3 backdrop-blur',
    title: 'text-xl',
    body: 'px-6 py-4',
  },
  table: {
    inline: false,
    bar: 'sticky top-0 z-10 bg-background/60 px-4 py-2 backdrop-blur',
    title: 'text-base',
    body: 'p-4',
  },
  file: { inline: false, bar: 'px-6 py-2', title: 'text-sm', body: 'p-6' },
};

/** The one review header: title and state, worded actions, icon group. */
function ItemReviewHeader({
  kind,
  icon,
  title,
  badge,
  textActions,
  iconActions,
}: {
  kind: SpaceKind;
  icon: string | null;
  title: string;
  badge?: ReactNode;
  textActions: ReactNode;
  iconActions: ReactNode;
}) {
  const look = HEADER_LOOK[kind];
  const row = (
    <div
      data-testid="item-review-header"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2',
        !look.inline && cn('border-b border-border', look.bar),
      )}
    >
      <h2
        className={cn('flex min-w-0 flex-1 basis-48 items-center gap-2 font-semibold', look.title)}
      >
        <span aria-hidden className="shrink-0">
          {icon ?? MEMBER_KIND[kind].icon}
        </span>
        <span className="min-w-0 truncate">{title || 'Untitled'}</span>
        {badge}
      </h2>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
        <div
          data-testid="review-header-text-actions"
          className="flex max-w-full flex-wrap items-center gap-2"
        >
          {textActions}
        </div>
        <div
          role="group"
          aria-label="Item actions"
          data-testid="review-header-icon-actions"
          className="flex items-center gap-1"
        >
          {iconActions}
        </div>
      </div>
    </div>
  );
  return look.inline ? <div className={look.bar}>{row}</div> : row;
}

/** Each workspace's list query key (its first segment). */
const LIST_KEY: Record<SpaceKind, string> = {
  page: 'pages',
  note: 'notes',
  table: 'tables',
  draw: 'draws',
  file: 'files',
};

/** Where the pane goes after an action: the brain item an Approve made (the
 *  workspace opens it), or nothing picked. */
export type ItemReviewDone = (opened?: string) => void;

/** A shared item as the brain answers it: its saved body and author. */
type SharedDetail = {
  row: { id: string; type: SpaceKind; title: string; icon: string | null; updatedAt: string };
  body: SpaceItemBody;
  author: SharedItemAuthor;
};

/** What the pane shows: a waiting item, or one shared with the team. */
type PaneItem = { mode: 'waiting'; item: ReviewItem } | { mode: 'shared'; item: SharedDetail };

/** The item by id: waiting for approval first (the review queue's routes),
 *  else shared with the team. A 404 from both is "neither any more". */
async function loadPaneItem(id: string): Promise<PaneItem> {
  try {
    return { mode: 'waiting', item: await memberReview.item(id) };
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  return { mode: 'shared', item: await apiFetch<SharedDetail>(sharedItemPath(id)) };
}

/** One waiting or shared item in the workspace's detail pane. */
export function ItemReview({
  id,
  kind,
  onDone,
}: {
  id: string;
  kind: SpaceKind;
  onDone: ItemReviewDone;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: itemKey(id),
    queryFn: () => loadPaneItem(id),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: QUEUE_KEY });
  }, [qc]);
  const done = useCallback(
    (opened?: string) => {
      // The queue, but not this item's own read: refetched now it would
      // flash "not waiting any more" on the way out. The workspace's list
      // and tree too: an approved item is a brain item now.
      void qc.invalidateQueries({ queryKey: QUEUE_KEY, exact: true });
      void qc.invalidateQueries({ queryKey: SHARED_ITEMS_KEY });
      void qc.invalidateQueries({ queryKey: [LIST_KEY[kind]] });
      void qc.invalidateQueries({ queryKey: ['tree'] });
      onDone(opened);
    },
    [qc, kind, onDone],
  );

  if (q.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <ClipboardCheck className="size-6 opacity-60" aria-hidden />
        <p>
          {q.error instanceof ApiError && q.error.status === 404
            ? 'This item is not waiting or shared any more. Its author may have made it private.'
            : reviewErrorMessage(q.error, 'Could not load this item.')}
        </p>
      </div>
    );
  }
  if (q.data.mode === 'shared') {
    return <SharedItemReview kind={kind} item={q.data.item} onDone={done} />;
  }

  const row = q.data.item.row;
  const look = HEADER_LOOK[kind];
  const state = reviewStateBadge(row);
  const role = authorRoleLabel(row.author.role);
  const textActions = (
    <>
      <AcceptDialog row={row} onDone={done} onChanged={refresh} />
      {!isLeftBehind(row) ? <RejectDialog row={row} onDone={done} onChanged={refresh} /> : null}
      {canTakeOver(row) ? <TakeOverDialog row={row} onDone={done} onChanged={refresh} /> : null}
      {row.author.inactive ? <DiscardDialog row={row} onDone={done} onChanged={refresh} /> : null}
    </>
  );
  const iconActions = (
    <>
      <HeaderInfoButton label="About this review">
        <p className="font-medium">{reviewInfoLine(row)}</p>
        <p className="text-muted-foreground">
          {row.author.email ? `${row.author.name} (${row.author.email})` : row.author.name}
          {role ? ` · ${role}` : ''}
          {row.submittedAt ? ` · sent ${fmtWhen(row.submittedAt)}` : ''}
        </p>
        {row.author.inactive ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <UserX className="mt-px size-3.5 shrink-0" aria-hidden />
            This login is deactivated.
          </p>
        ) : null}
        {isReleased(row) ? (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Unlock className="mt-px size-3.5 shrink-0" aria-hidden />
            Released: the admin who took this over is no longer an admin, so it is back with what
            was taken with it.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Read only: this is the version that was sent.
        </p>
      </HeaderInfoButton>
      <FocusToggle />
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <ItemReviewHeader
          kind={kind}
          icon={row.icon}
          title={row.title}
          badge={
            state || role === 'Client' ? (
              <Badge variant="secondary" className="shrink-0">
                {state ?? role}
              </Badge>
            ) : undefined
          }
          textActions={textActions}
          iconActions={iconActions}
        />
        <div className={look.body}>
          <ReviewItemView item={q.data.item} />
        </div>
      </div>
    </div>
  );
}

/** A member's item shared with the team: read only, with Unshare. Take over
 *  is for submitted items only (the brain refuses it here). */
function SharedItemReview({
  kind,
  item,
  onDone,
}: {
  kind: SpaceKind;
  item: SharedDetail;
  onDone: ItemReviewDone;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const unshare = useMutation({
    mutationFn: () => apiSend(`${sharedItemPath(item.row.id)}/unshare`, 'POST'),
    onSuccess: () => {
      toast.success(SHARED_UNSHARED_TOAST);
      onDone();
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: SHARED_ITEMS_KEY });
      toast.error(
        e instanceof ApiError && e.status === 404
          ? 'It is not shared with the team any more.'
          : e instanceof Error
            ? e.message
            : 'Could not unshare it.',
      );
    },
  });
  // The read-only view takes the review row's shape; a shared item has the
  // fields it reads (id, title, icon) and its own byte routes.
  const view: ReviewItem = {
    row: { ...item.row } as unknown as ReviewItemRow,
    body: item.body,
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <ItemReviewHeader
          kind={kind}
          icon={item.row.icon}
          title={item.row.title}
          textActions={
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unshare.isPending}
                  title={SHARED_UNSHARE_HINT}
                >
                  <UserMinus />
                  Unshare
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unshare “{item.row.title || 'Untitled'}”?</AlertDialogTitle>
                  <AlertDialogDescription>{unshareConfirm(item)}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => unshare.mutate()}>Unshare</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          }
          iconActions={
            <>
              <HeaderInfoButton label="About this item">
                <p className="font-medium">{sharedInfoLine(item)}</p>
                <p className="text-muted-foreground">Last changed {fmtWhen(item.row.updatedAt)}.</p>
                <p className="text-xs text-muted-foreground">
                  Read only: this is the version its author saved, as the team sees it.
                </p>
              </HeaderInfoButton>
              <FocusToggle />
            </>
          }
        />
        <div className={HEADER_LOOK[kind].body}>
          <ReviewItemView item={view} root={sharedItemPath} />
        </div>
      </div>
    </div>
  );
}

/** The saved version, read-only, through the same presenters the member
 *  reader uses; every byte comes from the item's own routes: the
 *  submission's, or (`root`) a shared item's. */
export function ReviewItemView({
  item,
  root,
}: {
  item: ReviewItem;
  root?: (id: string) => string;
}) {
  const asset = useAssetUrl();
  const { row, body } = item;
  const mapAsset = useCallback((p: string) => reviewAssetPath(row.id, p, root), [row.id, root]);
  switch (body.type) {
    case 'page':
      return (
        <PageReadWithOutline
          content={body.page.doc as JSONContent}
          mapAssetPath={mapAsset}
          folderId={(body.page as { folderId?: string | null }).folderId}
          // Before Accept the draft may sit in its author's own folder, which
          // the owner tree does not hold: the block then shows its label alone.
          quietHere
        />
      );
    case 'note':
      return <ReaderNote content={body.note.content} imagePath={noteAssetPath(mapAsset)} />;
    case 'draw':
      return (
        <DrawPresenter
          view={{ title: row.title, hasSvg: true }}
          src={asset(reviewSvgPath(row.id, row.id, root))}
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
          assetUrl={() => asset(reviewBytesPath(row.id, row.id, root))}
          chrome="embedded"
        />
      );
  }
}
