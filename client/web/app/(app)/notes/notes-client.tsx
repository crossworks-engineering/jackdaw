'use client';

import { useRememberLastOpened } from '@/components/last-opened/last-opened';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { AudienceBadge } from '@/components/share/audience-badge';
import { OwnerClientThread } from '@/components/share/owner-client-thread';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Pencil, Sparkles, Trash2 } from 'lucide-react';
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
import { AccessControl } from '@/components/share/access-control';
import { ExportButton } from '@/components/export/export-button';
import { useToast } from '@mantle/web-ui/ui/toast';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { cn } from '@mantle/web-ui/lib/utils';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { syncSelectionParam } from '@/lib/url-sync';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useSurfaceAssist } from '@/components/assistant/use-surface-assist';
import type { AdminPrivateListRow } from '@mantle/client-types';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { ItemCard, ItemIcon } from '@/components/item-list/item-card';
import {
  ItemListEmpty,
  ItemListHeader,
  ItemListScroll,
  NewButton,
} from '@/components/item-list/item-list-header';
import { ClearFilter, StateFilter, TagFilter } from '@/components/item-list/item-filters';
import { useCardDetails } from '@/components/item-list/use-card-details';
import {
  ADMIN_STATE_OPTIONS,
  PrivateItemCard,
  PrivateItemDetail,
  adminStateOf,
  isPrivateRow,
  usePrivateOpen,
  type AdminListState,
} from '@/components/item-list/admin-private-rows';
import { DropdownMenuItem } from '@mantle/web-ui/ui/dropdown-menu';
import { ItemTree } from '@/components/item-tree/item-tree';
import { useTreeSearch } from '@/components/item-tree/use-tree-search';
import { notesAdapter } from '@/components/item-tree/kinds/simple';
import { treeKey } from '@/components/item-tree/tree-api';
import { useTreeServes } from '@/components/item-tree/use-tree-kinds';
import { NoteEditor, type NoteRow } from './note-editor';

type TagCount = { tag: string; count: number };

type NotesListResponse = {
  /** Brain notes, and with `state=all|private` the admin's own private
   *  notes (AdminPrivateListRow, the `private` key marks them). */
  notes: Array<NoteRow | AdminPrivateListRow>;
  total: number;
  page: number;
  pageSize: number;
  tags: TagCount[];
};

/** Mirror of @mantle/content's isDigestTag — local copy because that module
 *  pulls in the server-only db client and can't enter the client bundle. */
const isDigestTag = (t: string) =>
  t === 'conversation-digest' || t.startsWith('agent:') || t.startsWith('topic:');

export function NotesClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [navPending, startNav] = useTransition();

  // URL is the source of truth (matches the old SSR page); the list query keys
  // off these so a `go()` navigation re-fetches automatically.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const activeTag = searchParams.get('tag')?.trim() || null;
  const showDigests =
    searchParams.get('digests') === '1' || (!!activeTag && isDigestTag(activeTag));
  // Which items: all (default), the brain's, or this admin's private ones
  // (item-list alignment). Always sent: the brain's default is `brain`.
  const state = adminStateOf(searchParams);
  const { pid, openPrivate } = usePrivateOpen();

  // The item tree when this brain serves it for notes (docs/folder-tree.md);
  // the paged card list for a brain before it, or if a tree call 404s.
  const treeServes = useTreeServes('notes');
  const [treeGone, setTreeGone] = useState(false);
  const showTree = treeServes === true && !treeGone;
  const [treeQuery, setTreeQuery] = useTreeSearch();

  const listQuery = useQuery({
    queryKey: ['notes', { q: query, tag: activeTag, digests: showDigests, page, state }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (activeTag) qs.set('tag', activeTag);
      if (showDigests) qs.set('digests', '1');
      if (page > 1) qs.set('page', String(page));
      qs.set('state', state);
      return apiFetch<NotesListResponse>(`/api/notes?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
    enabled: !showTree,
  });

  const rows = useMemo(
    () => (showTree ? [] : (listQuery.data?.notes ?? [])),
    [showTree, listQuery.data?.notes],
  );
  const notes = useMemo(() => rows.filter((r): r is NoteRow => !isPrivateRow(r)), [rows]);
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 50;
  const tags = useMemo(() => listQuery.data?.tags ?? [], [listQuery.data?.tags]);

  // Selection + edit mode seed from the URL (a `/notes/[id]` deep-link redirects
  // to `?selected=&edit=1`), then live as local state.
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('selected')?.trim() || null,
  );
  const [editing, setEditing] = useState<boolean>(searchParams.get('edit') === '1');

  // A deep-linked note may sit outside the current list slice — fetch it so the
  // right pane can open it even when it's not in `notes`.
  const selectedNoteQuery = useQuery({
    queryKey: ['notes', selectedId],
    queryFn: () => apiFetch<{ note: NoteRow }>(`/api/notes/${selectedId}`).then((r) => r.note),
    enabled: !!selectedId && !notes.some((n) => n.id === selectedId),
  });
  const [creating, setCreating] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Pick<NoteRow, 'id' | 'title'> | null>(null);
  /** Pending action held back by the unsaved-changes guard. */
  const [discard, setDiscard] = useState<{ run: () => void } | null>(null);

  const [searchInput, setSearchInput] = useState(query);

  // Card density (summaries and tags), as on every list screen.
  const [details, changeDetails] = useCardDetails('mantle_notes_card_details_v1');

  // ── Selection / edit state machine ──────────────────────────────────
  // The first card, when nothing is picked (auto-select), whichever kind.
  const first = !selectedId && !pid ? (rows[0] ?? null) : null;
  // The private note `?pid=` names, or a private first card.
  const privateOpen = pid ?? (first && isPrivateRow(first) ? first.id : null);
  const selected = useMemo<NoteRow | null>(() => {
    if (privateOpen) return null;
    if (selectedId) {
      return (
        notes.find((n) => n.id === selectedId) ??
        (selectedNoteQuery.data?.id === selectedId ? selectedNoteQuery.data : null)
      );
    }
    return first && !isPrivateRow(first) ? first : null;
  }, [privateOpen, selectedId, notes, selectedNoteQuery.data, first]);
  // Notes opens on this note next time (lib/last-opened.ts): one the user
  // picked and that loaded, not the first card shown by default.
  useRememberLastOpened('notes', selectedId && selected?.id === selectedId ? selectedId : null);

  // Pin whatever the right pane is showing. That includes the `notes[0]`
  // fallback above: nothing was clicked, but the note is on screen and read,
  // so "summarise this" should mean it. The chip is removable when it isn't
  // what the user meant.
  useSurfaceAssist({
    node: selected
      ? { id: selected.id, kind: 'note', label: selected.title || 'Untitled note' }
      : null,
  });

  /** Run an action, but if the editor has unsaved changes, confirm first. */
  const guard = useCallback(
    (run: () => void) => {
      if (editing && dirty) setDiscard({ run });
      else run();
    },
    [editing, dirty],
  );

  const exitEdit = useCallback(() => {
    setEditing(false);
    setCreating(false);
    setFocus(false);
    setDirty(false);
  }, []);

  const selectNote = (id: string) =>
    guard(() => {
      setSelectedId(id);
      syncSelectionParam('selected', id);
      if (pid) openPrivate(null);
      exitEdit();
    });

  const selectPrivate = (id: string) =>
    guard(() => {
      exitEdit();
      openPrivate(id);
    });

  const startCreate = () =>
    guard(() => {
      setCreating(true);
      setEditing(true);
      setFocus(false);
    });

  const startEdit = () => {
    setCreating(false);
    setEditing(true);
  };

  const onSaved = (saved: NoteRow) => {
    setEditing(false);
    setCreating(false);
    setFocus(false);
    setDirty(false);
    setSelectedId(saved.id);
    syncSelectionParam('selected', saved.id);
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
    void queryClient.invalidateQueries({ queryKey: treeKey('notes') });
  };

  const buildHref = (over: {
    page?: number;
    tag?: string | null;
    q?: string | null;
    digests?: boolean;
    state?: AdminListState;
  }) => {
    const nextTag = over.tag !== undefined ? over.tag : activeTag;
    const nextQ = over.q !== undefined ? over.q : query || null;
    const nextPage = over.page !== undefined ? over.page : page;
    const nextDigests = over.digests !== undefined ? over.digests : showDigests;
    const nextState = over.state ?? state;
    const params = new URLSearchParams();
    if (nextState !== 'all') params.set('state', nextState);
    if (nextTag) params.set('tag', nextTag);
    if (nextQ) params.set('q', nextQ);
    if (nextDigests) params.set('digests', '1');
    if (nextPage && nextPage > 1) params.set('page', String(nextPage));
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const go = (over: Parameters<typeof buildHref>[0]) =>
    startNav(() => router.push(buildHref(over)));

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput.trim() === query) return;
      go({ q: searchInput.trim() || null, page: 1 });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiSend(`/api/notes/${deleteTarget.id}`, 'DELETE');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not delete note');
      return;
    }
    toast.success('Note deleted');
    if (selected?.id === deleteTarget.id) exitEdit();
    if (selectedId === deleteTarget.id) {
      setSelectedId(null);
      syncSelectionParam('selected', null);
    }
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
    void queryClient.invalidateQueries({ queryKey: treeKey('notes') });
  };

  if (!showTree && listQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!showTree && listQuery.isError && !listQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p className="text-muted-foreground">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load notes.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <MasterDetail
        id="notes"
        // The screen's old clamps, so the column lands and stops where it did.
        defaultListSize="380px"
        minListSize="300px"
        maxListSize="760px"
        // A note is PROSE, so it takes the three-panel default: a bounded card
        // with a real grab handle and the spacer holding the slack, the way
        // Formulas and Contacts read. It opens at 900px — the measure /pages
        // chose — and `maxDetailSize="100%"` leaves its own handle no ceiling,
        // so a member who wants the whole window can still drag for it.
        //
        // ⚠ This was `detailFills`, and both halves of the comment defending it
        // were wrong. A markdown editor is text the writer READS while writing;
        // style guide §8 puts prose under the default and says so twice,
        // naming `/pages` shipping `detailFills` as the mistake. And the mode
        // below is not "literally called full width" — focus-toggle.tsx labels
        // it "Focus mode". For prose the guide is explicit that focus should
        // remove the CHROME, not re-flow the paragraph the writer is in the
        // middle of, which is exactly what the spacer absorbing the freed width
        // does. So this screen keeps its spacer.
        defaultDetailSize="900px"
        // 480, like /pages: this pane holds the editor AND the preview beside
        // it, and two columns inside the 420px default is not two columns.
        minDetailSize="480px"
        maxDetailSize="100%"
        // Focus mode. The list COLLAPSES rather than unmounting, so the search
        // box, scroll position and page survive the round trip — see the prop's
        // note in master-detail.tsx.
        listCollapsed={focus}
        list={
          showTree ? (
            <aside className="flex h-full flex-col bg-muted/20">
              <ItemTree
                kind="notes"
                adapter={notesAdapter}
                selectedItemId={privateOpen ?? (creating ? null : (selected?.id ?? null))}
                query={treeQuery}
                onQueryChange={setTreeQuery}
                searchPlaceholder="Search notes and folders…"
                actions={<NewButton onClick={startCreate} />}
                onOpenItem={(item) =>
                  item.state === 'private' ? selectPrivate(item.id) : selectNote(item.id)
                }
                itemActions={(item) =>
                  item.state === 'private' ? null : (
                    <DropdownMenuItem
                      className="text-destructive-ink focus:text-destructive-ink"
                      onSelect={() => setDeleteTarget({ id: item.id, title: item.title })}
                    >
                      <Trash2 />
                      Delete…
                    </DropdownMenuItem>
                  )
                }
                // A share or a move changes the level the open item is read
                // at: its header badge and client thread follow.
                onChanged={() => void queryClient.invalidateQueries({ queryKey: ['notes'] })}
                onUnsupported={() => setTreeGone(true)}
              />
            </aside>
          ) : (
            <>
              <ItemListHeader
                search={searchInput}
                onSearch={setSearchInput}
                placeholder="Search notes…"
                actions={<NewButton onClick={startCreate} />}
              >
                <TagFilter
                  tags={tags}
                  activeTag={activeTag}
                  onSelect={(t) => go({ tag: t, page: 1 })}
                  details={details}
                  onDetailsChange={changeDetails}
                  allLabel="All notes"
                />
                <StateFilter
                  value={state}
                  options={ADMIN_STATE_OPTIONS}
                  onChange={(v) => go({ state: v, page: 1 })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'h-7 gap-1 px-2',
                    showDigests ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-pressed={showDigests}
                  onClick={() =>
                    go({
                      digests: !showDigests,
                      page: 1,
                      // Hiding digests while filtered on a digest tag would show an
                      // empty list — drop the tag along with them.
                      ...(showDigests && activeTag && isDigestTag(activeTag) ? { tag: null } : {}),
                    })
                  }
                  title={
                    showDigests
                      ? 'Hide agent conversation digests'
                      : 'Show agent conversation digests'
                  }
                >
                  <Sparkles className="size-3.5" /> Digests
                </Button>
                {activeTag && (
                  <ClearFilter
                    onClear={() => go({ tag: null, page: 1 })}
                    title="Clear tag filter"
                  />
                )}
              </ItemListHeader>

              <ItemListScroll pending={navPending}>
                {rows.length === 0 ? (
                  <ItemListEmpty>
                    {state === 'private' && !query
                      ? 'You have no private notes. Only you would see them, until you accept one into the brain.'
                      : query || activeTag
                        ? 'No notes match your search or filter.'
                        : 'No notes yet. Click “New” or ask your assistant to add one.'}
                  </ItemListEmpty>
                ) : (
                  rows.map((n) =>
                    isPrivateRow(n) ? (
                      <PrivateItemCard
                        key={n.id}
                        row={n}
                        selected={privateOpen === n.id}
                        onSelect={() => selectPrivate(n.id)}
                      />
                    ) : (
                      <ItemCard
                        key={n.id}
                        id={n.id}
                        kind="note"
                        title={n.title}
                        icon={<ItemIcon fallback={<FileText />} />}
                        badge={
                          <AudienceBadge
                            level={n.audience}
                            inherited={n.inherited}
                            className="mt-0.5"
                          />
                        }
                        selected={!privateOpen && selected?.id === n.id && !creating}
                        onSelect={() => selectNote(n.id)}
                        updatedAt={n.updatedAt}
                      >
                        {details && (n.summary || n.content) && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {n.summary ?? n.content.slice(0, 200)}
                          </p>
                        )}
                        {details && n.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {n.tags.map((t) => (
                              <TagPill key={t} tag={t} />
                            ))}
                          </div>
                        )}
                      </ItemCard>
                    ),
                  )
                )}
              </ItemListScroll>

              <ListPager
                page={page}
                total={total}
                pageSize={pageSize}
                pending={navPending}
                onGo={(p) => go({ page: p })}
                noun={{ one: 'note', many: 'notes' }}
              />
            </>
          )
        }
        // Both the editor and the preview open with their own sticky header
        // above a scrolling body, so each keeps its own scroller.
        // `h-full overflow-hidden` means the pane's scroller can never
        // overflow, so only one bar is ever painted.
        detail={
          <div className="md:h-full md:overflow-hidden">
            {privateOpen ? (
              <div className="relative h-full min-h-0">
                <PrivateItemDetail
                  key={privateOpen}
                  id={privateOpen}
                  onClose={() => openPrivate(null)}
                />
              </div>
            ) : editing ? (
              <NoteEditor
                note={creating ? null : selected}
                focus={focus}
                onToggleFocus={() => setFocus((f) => !f)}
                onSaved={onSaved}
                onCancel={() => guard(exitEdit)}
                onDirtyChange={setDirty}
              />
            ) : selected ? (
              <NotePreview
                note={selected}
                onEdit={startEdit}
                onDelete={() => setDeleteTarget(selected)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
                Select a note, or click{' '}
                <span className="mx-1 font-medium text-foreground">New</span> to start one.
              </div>
            )}
          </div>
        }
      />

      {/* Discard-unsaved-changes guard */}
      <AlertDialog open={discard !== null} onOpenChange={(o) => !o && setDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This note has edits that haven’t been saved. Leaving now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const run = discard?.run;
                setDirty(false);
                setDiscard(null);
                run?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Right-pane read view — de-boxed: full-width prose, sticky header, own scroll. */
function NotePreview({
  note,
  onEdit,
  onDelete,
}: {
  note: NoteRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/60 px-6 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            <span className="min-w-0 truncate">{note.title}</span>
            <AudienceBadge level={note.audience} inherited={note.inherited} />
          </h2>
          {note.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {note.tags.map((t) => (
                <TagPill key={t} tag={t} />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportButton nodeId={note.id} label="Word" />
          <AccessControl nodeId={note.id} />
          {/* At Client level: the thread clients read (audit U2). */}
          <OwnerClientThread
            nodeId={note.id}
            type="note"
            audience={note.audience}
            inherited={note.inherited}
          />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive-ink"
            onClick={onDelete}
            aria-label="Delete note"
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scrollbar-thin px-6 py-5">
        <article className="prose prose-sm dark:prose-invert max-w-none prose-accent prose-document">
          {note.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
          ) : (
            <p className="text-sm italic text-muted-foreground">
              No content yet. Click{' '}
              <span className="font-medium not-italic text-foreground">Edit</span> to add some.
            </p>
          )}
        </article>

        {/* Digest notes store the same text as content and summary (the note IS
            a summary) — skip the box rather than render the body twice. */}
        {note.summary && note.summary.trim() !== note.content.trim() && (
          <aside className="rounded-md border border-border bg-muted/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden /> Indexed summary
            </div>
            <p className="text-sm text-muted-foreground">{note.summary}</p>
          </aside>
        )}

        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          Updated {formatDateTime(note.updatedAt)} · created {formatDateTime(note.createdAt)}
        </div>
      </div>
    </div>
  );
}
