'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  GraduationCap,
  HelpCircle,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { KINDS, kindLabel } from '@mantle/content-core/journal-options';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
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
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { useListNav } from '@/lib/use-list-nav';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { ListCard, ListCardSnippet, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { cn } from '@mantle/web-ui/lib/utils';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { syncSelectionParam } from '@/lib/url-sync';
import { useSurfaceAssist } from '@/components/assistant/use-surface-assist';
import { GapAnswerForm } from '@/components/journal/gap-answer';
import { JournalEditor, type JournalRow } from './journal-editor';

const ALL = '__all__';

/** The three ways into the journal. 'you' = the user lane (self-knowledge),
 *  'agents' = the agent lane (working notes), 'questions' = open gaps only. */
const VIEWS = [
  { key: 'you', label: 'You' },
  { key: 'agents', label: 'Agent notes' },
  { key: 'questions', label: 'Questions' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

type JournalListResponse = {
  journals: JournalRow[];
  total: number;
  page: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
};

/** Per-kind list glyph. User-lane entries keep the notebook; agent-lane kinds
 *  get their own so the Agent-notes view scans by shape. */
function KindIcon({ kind, className }: { kind: string | null; className?: string }) {
  const cls = cn('size-4 text-muted-foreground', className);
  if (kind === 'lesson') return <GraduationCap className={cls} />;
  if (kind === 'expectation') return <Target className={cls} />;
  if (kind === 'gap') return <HelpCircle className={cls} />;
  return <NotebookPen className={cls} />;
}

export function JournalClient() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { pending, go } = useListNav();

  // URL is the source of truth (matches the old SSR page).
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const viewRaw = searchParams.get('view')?.trim();
  const view: ViewKey = viewRaw === 'agents' || viewRaw === 'questions' ? viewRaw : 'you';
  const activeKind = searchParams.get('kind')?.trim() || null;
  const activeTag = searchParams.get('tag')?.trim() || null;

  // The kinds the current view's narrow-filter offers.
  const viewKinds = useMemo(
    () => KINDS.filter((k) => (view === 'you' ? k.lane === 'user' : k.lane === 'agent')),
    [view],
  );

  const listQuery = useQuery({
    queryKey: ['journal', { view, q: query, kind: activeKind, tag: activeTag, page }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      if (view === 'questions') {
        // Open questions only — the whole point of the view.
        qs.set('kind', 'gap');
        qs.set('status', 'open');
      } else {
        qs.set('lane', view === 'agents' ? 'agent' : 'user');
        if (activeKind) qs.set('kind', activeKind);
      }
      if (activeTag) qs.set('tag', activeTag);
      if (page > 1) qs.set('page', String(page));
      return apiFetch<JournalListResponse>(`/api/journal?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const entries = useMemo(() => listQuery.data?.journals ?? [], [listQuery.data?.journals]);
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 50;
  const tags = listQuery.data?.tags ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('selected')?.trim() || null,
  );
  const [editing, setEditing] = useState<boolean>(searchParams.get('edit') === '1');
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JournalRow | null>(null);
  const [discard, setDiscard] = useState<{ run: () => void } | null>(null);
  const [searchInput, setSearchInput] = useState(query);

  // A deep-linked entry outside the current slice → fetch it directly.
  const selectedEntryQuery = useQuery({
    queryKey: ['journal', selectedId],
    queryFn: () =>
      apiFetch<{ journal: JournalRow }>(`/api/journal/${selectedId}`).then((r) => r.journal),
    enabled: !!selectedId && !entries.some((n) => n.id === selectedId),
  });

  const selected = useMemo<JournalRow | null>(() => {
    if (selectedId) {
      return (
        entries.find((n) => n.id === selectedId) ??
        (selectedEntryQuery.data?.id === selectedId ? selectedEntryQuery.data : null)
      );
    }
    return entries[0] ?? null;
  }, [selectedId, entries, selectedEntryQuery.data]);

  // Pin whatever the right pane is showing, including the first-row fallback —
  // it's on screen and read, so "what did I write about this?" should mean it.
  useSurfaceAssist({
    node: selected
      ? { id: selected.id, kind: 'journal', label: selected.title || 'Untitled entry' }
      : null,
  });

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
    setDirty(false);
  }, []);

  const selectEntry = (id: string) =>
    guard(() => {
      setSelectedId(id);
      syncSelectionParam('selected', id);
      exitEdit();
    });

  const switchView = (v: ViewKey) =>
    guard(() => {
      // Kind filters don't carry across lanes; selection rarely survives either.
      go({ view: v === 'you' ? null : v, kind: null, page: null });
      setSelectedId(null);
      syncSelectionParam('selected', null);
      exitEdit();
    });

  const startCreate = () =>
    guard(() => {
      setCreating(true);
      setEditing(true);
    });

  const startEdit = () => {
    setCreating(false);
    setEditing(true);
  };

  const onSaved = (saved: JournalRow) => {
    exitEdit();
    setSelectedId(saved.id);
    syncSelectionParam('selected', saved.id);
    void queryClient.invalidateQueries({ queryKey: ['journal'] });
  };

  const onGapResolved = () => {
    void queryClient.invalidateQueries({ queryKey: ['journal'] });
  };

  // Debounced search → URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput.trim() === query) return;
      go({ q: searchInput.trim() || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiSend(`/api/journal/${deleteTarget.id}`, 'DELETE');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not delete journal entry');
      return;
    }
    toast.success('Journal entry deleted');
    if (selected?.id === deleteTarget.id) exitEdit();
    if (selectedId === deleteTarget.id) {
      setSelectedId(null);
      syncSelectionParam('selected', null);
    }
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ['journal'] });
  };

  if (listQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (listQuery.isError && !listQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p className="text-muted-foreground">
          {listQuery.error instanceof Error
            ? listQuery.error.message
            : 'Failed to load journal entries.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const emptyCopy =
    query || activeKind || activeTag
      ? 'No journal entries match your search or filters.'
      : view === 'questions'
        ? 'No open questions — the brain has everything it needs right now.'
        : view === 'agents'
          ? 'No agent notes yet. Agents log lessons, expectations, and questions here as they work.'
          : 'No journal entries yet. Click “New” to record who you are, or let your assistant log one.';

  const listPane = (
    <>
      {/* ── Left: list ─────────────────────────────────────────────── */}
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search journal entries…"
              className="pl-8"
            />
          </div>
          <Button onClick={startCreate}>
            <Plus /> New
          </Button>
        </div>

        {/* The three views. A lane is a different question ("who am I" vs
            "what have my agents learned"), so it's a view switch, not a
            filter chip. */}
        <div className="flex items-center gap-1.5">
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              size="sm"
              variant={view === v.key ? 'default' : 'outline'}
              className="h-7 rounded-full px-3"
              onClick={() => switchView(v.key)}
            >
              {v.label}
            </Button>
          ))}
        </div>

        {view !== 'questions' && (
          <Select
            value={activeKind ?? ALL}
            onValueChange={(v) => go({ kind: v === ALL ? null : v, page: null })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Any kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any kind</SelectItem>
              {viewKinds.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={activeTag ? 'outline' : 'default'}
              className="h-7 rounded-full px-3"
              onClick={() => go({ tag: null, page: null })}
            >
              All
            </Button>
            {tags.slice(0, 12).map((t) => (
              <Button
                key={t.tag}
                size="sm"
                variant={activeTag === t.tag ? 'default' : 'outline'}
                className="h-7 rounded-full px-3"
                onClick={() => go({ tag: activeTag === t.tag ? null : t.tag, page: null })}
              >
                {t.tag}
                <span className="ml-1 opacity-60">{t.count}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Cards */}
      <div
        className={cn(
          'space-y-2 p-3 transition-opacity md:flex-1 md:overflow-y-auto md:scrollbar-thin',
          pending && 'opacity-60',
        )}
      >
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            {emptyCopy}
          </div>
        ) : (
          entries.map((n) => {
            const kind = kindLabel(n.kind);
            const openGap = n.kind === 'gap' && n.status !== 'resolved';
            return (
              <ListCard
                key={n.id}
                onClick={() => selectEntry(n.id)}
                data-mark-id={n.id}
                data-mark-kind="journal"
                data-mark-label={n.title}
                selected={selected?.id === n.id && !creating}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-4 shrink-0 text-center" aria-hidden>
                    <KindIcon kind={n.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <ListCardTitle>{n.title}</ListCardTitle>
                    {(n.summary || n.body) && (
                      <ListCardSnippet>{n.summary ?? n.body}</ListCardSnippet>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {kind && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                          {kind}
                        </span>
                      )}
                      {n.kind === 'gap' && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                            openGap
                              ? 'bg-warning text-warning-foreground'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {openGap ? 'Open' : 'Resolved'}
                        </span>
                      )}
                      {n.author === 'agent' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          <Bot className="size-3" aria-hidden />
                          {n.agentSlug ?? 'agent'}
                        </span>
                      )}
                      {n.tags.map((t) => (
                        <TagPill key={t} tag={t} />
                      ))}
                    </div>
                  </div>
                </div>
              </ListCard>
            );
          })
        )}
      </div>

      <ListPager
        page={page}
        total={total}
        pageSize={pageSize}
        pending={pending}
        onGo={(p) => go({ page: p > 1 ? p : null })}
      />
    </>
  );

  // ── Right: preview / editor ───────────────────────────────────────
  const detailPane = editing ? (
    <JournalEditor
      entry={creating ? null : selected}
      defaultKind={view === 'agents' ? 'lesson' : view === 'questions' ? 'gap' : 'context'}
      onSaved={onSaved}
      onCancel={() => guard(exitEdit)}
      onDirtyChange={setDirty}
    />
  ) : selected ? (
    <JournalPreview
      entry={selected}
      onEdit={startEdit}
      onDelete={() => setDeleteTarget(selected)}
      onResolved={onGapResolved}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
      {view === 'questions' ? (
        <>Nothing to answer right now.</>
      ) : (
        <>
          Select a journal entry, or click{' '}
          <span className="mx-1 font-medium text-foreground">New</span> to start one.
        </>
      )}
    </div>
  );

  return (
    <>
      <MasterDetail id="journal" list={listPane} detail={detailPane} />

      {/* Discard-unsaved-changes guard */}
      <AlertDialog open={discard !== null} onOpenChange={(o) => !o && setDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This journal entry has edits that haven’t been saved. Leaving now will lose them.
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

/** Right-pane read view. */
function JournalPreview({
  entry,
  onEdit,
  onDelete,
  onResolved,
}: {
  entry: JournalRow;
  onEdit: () => void;
  onDelete: () => void;
  onResolved: () => void;
}) {
  const kind = kindLabel(entry.kind);
  const openGap = entry.kind === 'gap' && entry.status !== 'resolved';
  return (
    // No inner scroller: the pane owns it (MasterDetail), so the sticky header
    // sticks to the pane's scroller instead of a second one nested inside it.
    <div>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          {/* §8: the glyph lives INSIDE the h2 so it shares the title's
              baseline. The kind is the entry's identity now. */}
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            <span className="shrink-0" aria-hidden>
              <KindIcon kind={entry.kind} className="size-5 text-primary-ink" />
            </span>
            <span className="min-w-0 truncate">{entry.title}</span>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {kind && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                {kind}
              </span>
            )}
            {entry.kind === 'gap' && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  openGap ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {openGap ? 'Open question' : 'Resolved'}
              </span>
            )}
            {entry.author === 'agent' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Bot className="size-3.5" aria-hidden />
                logged by {entry.agentSlug ?? 'an agent'}
              </span>
            )}
            {entry.tags.map((t) => (
              <TagPill key={t} tag={t} />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive-ink"
            onClick={onDelete}
            aria-label="Delete journal entry"
          >
            <Trash2 />
          </Button>
        </div>
      </header>

      <div className="space-y-5 px-6 py-5">
        {entry.body ? (
          <p className="whitespace-pre-wrap text-base leading-relaxed">{entry.body}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No content.</p>
        )}

        {openGap && (
          <aside className="rounded-md border border-border bg-muted/40 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <HelpCircle className="size-4 text-primary-ink" aria-hidden />
              The brain is missing this — your answer becomes shared knowledge.
            </div>
            <GapAnswerForm gap={entry} onResolved={onResolved} />
          </aside>
        )}

        {entry.summary && (
          <aside className="rounded-md border border-border bg-muted/40 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden /> Indexed summary
            </div>
            <p className="text-sm text-muted-foreground">{entry.summary}</p>
          </aside>
        )}

        <div className="border-t border-border pt-3 text-xs text-muted-foreground">
          {entry.entryDate ? <>For {formatDateTime(entry.entryDate)} · </> : null}
          Updated {formatDateTime(entry.updatedAt)} · created {formatDateTime(entry.createdAt)}
        </div>
      </div>
    </div>
  );
}
