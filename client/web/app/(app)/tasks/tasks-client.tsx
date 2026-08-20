'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ListTodo, MessageSquare, Plus, Search, SquareKanban, List } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { useListNav } from '@/lib/use-list-nav';
import { syncSelectionParam } from '@/lib/url-sync';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { ListCard, ListCardSnippet, ListCardTags } from '@mantle/web-ui/ui/list-card';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { useRealtime } from '@/components/realtime/use-realtime';
import { TaskForm, emptyTaskForm, type TaskPayload } from './task-form';
import { TaskDetail, type TaskPatch, type TaskRow } from './task-detail';
import { TaskBoard, type BoardMove } from './task-board';
import { useSurfaceAssist } from '@/components/assistant/use-surface-assist';
import {
  PRIORITIES,
  STATUSES,
  STATUS_LABEL,
  dueLabel,
  type Priority,
  type Status,
} from './task-meta';

type Selection = { mode: 'create' } | { mode: 'view'; id: string } | null;

type TasksListResponse = { tasks: TaskRow[]; total: number; page: number; pageSize: number };

export function TasksClient() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { pending: navPending, go } = useListNav();
  const toast = useToast();

  // URL is the source of truth (matches the old SSR page). Status defaults to
  // 'active' here — every not-done state — while the GET defaults to 'all',
  // so send it explicitly.
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  // 'archived' rides in the status param for the UI's sake, but it is a
  // different axis on the wire: the server takes `?archived=only` and leaves
  // status alone, so an archived task keeps whatever status it had.
  const statusParam = searchParams.get('status')?.trim() || 'active';
  const showingArchive = statusParam === 'archived';
  const status = (showingArchive ? 'all' : statusParam) as Status | 'all' | 'active';
  const priority = (searchParams.get('priority')?.trim() || 'all') as Priority | 'all';
  const urlSelected = searchParams.get('selected')?.trim() || null;
  const view: 'list' | 'board' = searchParams.get('view') === 'board' ? 'board' : 'list';
  const isBoard = view === 'board';

  const listQuery = useQuery({
    queryKey: ['tasks', { q: query, status, priority, page, showingArchive }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      qs.set('status', status);
      if (showingArchive) qs.set('archived', 'only');
      if (priority !== 'all') qs.set('priority', priority);
      if (page > 1) qs.set('page', String(page));
      return apiFetch<TasksListResponse>(`/api/tasks?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
    enabled: !isBoard,
  });

  // The board loads every column in one call (server caps pageSize at 500) —
  // status comes from the columns themselves, so only q/priority filter it.
  const boardQuery = useQuery({
    queryKey: ['tasks', 'board', { q: query, priority }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      qs.set('status', 'all');
      if (priority !== 'all') qs.set('priority', priority);
      qs.set('pageSize', '500');
      return apiFetch<TasksListResponse>(`/api/tasks?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
    enabled: isBoard,
  });

  const activeQuery = isBoard ? boardQuery : listQuery;

  // A deep-linked task (`?selected=`) may sit outside the current slice or be
  // filtered out — fetch it directly so the detail pane can still open it.
  const selectedTaskQuery = useQuery({
    queryKey: ['tasks', urlSelected],
    queryFn: () => apiFetch<{ task: TaskRow }>(`/api/tasks/${urlSelected}`).then((r) => r.task),
    enabled: !!urlSelected && !(activeQuery.data?.tasks ?? []).some((t) => t.id === urlSelected),
  });

  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? 50;

  // Local working copy of the list, so mutations can update optimistically. Seeded
  // from the active query (+ a deep-linked task pinned at the top); the seed effect
  // reconciles it whenever the server data changes (incl. after an invalidate).
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  useEffect(() => {
    const base = activeQuery.data?.tasks ?? [];
    const extra =
      selectedTaskQuery.data && !base.some((t) => t.id === selectedTaskQuery.data!.id)
        ? [selectedTaskQuery.data]
        : [];
    setTasks([...extra, ...base]);
  }, [activeQuery.data, selectedTaskQuery.data]);

  // Live repaint: another tab, an agent, or a team member touching tasks or
  // comments shows up without a manual reload (events-client precedent).
  // Trailing debounce: a burst of notifies (bulk edit, extractor sweep, a
  // comment exchange) collapses into one refetch instead of one per frame.
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(['task', 'comment'], () => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }, 400);
  });

  const [searchInput, setSearchInput] = useState(query);
  const [pending, startTransition] = useTransition();
  // null = "not yet defaulted"; the effect below picks the first task / create
  // mode once the list loads, unless the URL deep-links a selection. The board
  // stays unselected until you click a card — auto-selecting there would open a
  // form beside a board you had only just switched to.
  const [sel, setSel] = useState<Selection>(urlSelected ? { mode: 'view', id: urlSelected } : null);
  useEffect(() => {
    if (isBoard || sel !== null) return;
    // ONCE THE LIST LOADS, and not a frame before. `tasks` is a local copy
    // seeded by the effect above, so on a cold load there are two commits where
    // it is still empty while rows are on their way: the pending one, and the
    // one where the query first resolves (this effect sees the previous render's
    // `tasks`). Defaulting in either lands on the create form and then stays
    // there, because a non-null `sel` is never revisited — every fresh load of
    // /tasks opened a composer instead of the first task.
    if (!activeQuery.isSuccess) return;
    if (tasks.length === 0 && (activeQuery.data?.tasks.length ?? 0) > 0) return;
    setSel(tasks[0] ? { mode: 'view', id: tasks[0].id } : { mode: 'create' });
  }, [tasks, sel, isBoard, activeQuery.isSuccess, activeQuery.data]);

  // Reflect the selected task in the URL (?selected=) as the user clicks
  // around — copy-/share-/bookmark-able, and aligned with the `/n/<id>`
  // permalink. `replaceState` (no fetch, no back-stack entry); skip the first
  // run so a fresh load / deep link isn't rewritten before any interaction.
  const didSyncMount = useRef(false);
  useEffect(() => {
    if (!didSyncMount.current) {
      didSyncMount.current = true;
      return;
    }
    syncSelectionParam('selected', sel?.mode === 'view' ? sel.id : null);
  }, [sel]);

  // Debounced search → URL (?q=); resets to page 1.
  useEffect(() => {
    const h = setTimeout(() => {
      if (searchInput.trim() !== query) go({ q: searchInput.trim() || null, page: null });
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filtering = !!query || statusParam !== 'active' || priority !== 'all';
  const selected = sel?.mode === 'view' ? (tasks.find((t) => t.id === sel.id) ?? null) : null;

  // Pin the open task. The list auto-selects row one like its siblings, so it
  // pins on arrival; the BOARD deliberately stays unselected until a card is
  // clicked, and pins nothing until then. That asymmetry is right — a board is
  // a view of many tasks, and there is no one task it is "about".
  useSurfaceAssist({
    node: selected
      ? { id: selected.id, kind: 'task', label: selected.title || 'Untitled task' }
      : null,
  });

  const createTask = async (payload: TaskPayload) => {
    let task: TaskRow;
    try {
      ({ task } = await apiSend<{ task: TaskRow }>('/api/tasks', 'POST', payload));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not save task');
      return;
    }
    setTasks((prev) => [task, ...prev]);
    setSel({ mode: 'view', id: task.id });
    toast.success(`Added “${task.title}”`);
    startTransition(async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
  };

  /** One optimistic write path for every partial update — status moves, board
   *  drags ({status, rank}), todos edits, and the full edit form. */
  const patchTask = async (id: string, patch: TaskPatch & { rank?: string }): Promise<boolean> => {
    // Row-scoped revert: restoring the whole snapshot would clobber writes
    // that landed on OTHER rows while this one was in flight (review catch).
    const beforeRow = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...patch } as TaskRow) : t)));
    let task: TaskRow;
    try {
      ({ task } = await apiSend<{ task: TaskRow }>(`/api/tasks/${id}`, 'PATCH', patch));
    } catch (e) {
      if (beforeRow) setTasks((prev) => prev.map((t) => (t.id === id ? beforeRow : t)));
      if (e instanceof ApiError && e.status === 401) return false; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not update task');
      return false;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    startTransition(async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
    return true;
  };

  // What each task was before the checkbox marked it done, so unticking is an
  // UNDO rather than a reset. The checkbox is binary over a four-state
  // vocabulary: without this, ticking a Blocked task and unticking it to change
  // your mind silently lands it on To do, and the state is gone. Now that
  // Blocked is only reachable from the form, that was the easiest way to lose it.
  //
  // A ref, not state: nothing renders from it, and it must not trigger a
  // repaint mid-toggle. Deliberately NOT persisted — after a reload, unticking
  // an old task is no longer an undo, so `open` is the honest answer.
  const statusBeforeDone = useRef(new Map<string, Status>());

  const toggleStatus = (t: TaskRow) => {
    if (t.status === 'done') {
      const restored = statusBeforeDone.current.get(t.id) ?? 'open';
      statusBeforeDone.current.delete(t.id);
      return void patchTask(t.id, { status: restored });
    }
    statusBeforeDone.current.set(t.id, t.status);
    void patchTask(t.id, { status: 'done' });
  };

  const moveTask = (m: BoardMove) => void patchTask(m.taskId, { status: m.status, rank: m.rank });

  const removeTask = async (id: string) => {
    try {
      await apiSend(`/api/tasks/${id}`, 'DELETE');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already bounced to /login
      toast.error(e instanceof Error ? e.message : 'Could not delete task');
      return;
    }
    toast.success('Task deleted');
    setTasks((prev) => {
      const nextList = prev.filter((t) => t.id !== id);
      if (isBoard) {
        setSel(null);
      } else {
        setSel(nextList[0] ? { mode: 'view', id: nextList[0].id } : { mode: 'create' });
      }
      return nextList;
    });
    startTransition(async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
  };

  if (activeQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (activeQuery.isError && !activeQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <p className="text-muted-foreground">
          {activeQuery.error instanceof Error ? activeQuery.error.message : 'Failed to load tasks.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => activeQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const viewToggle = (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={(v) => {
        // The board shows every status as a column, so a sticky per-status
        // filter would silently contradict the URL — clear it on switch.
        if (!v || v === view) return;
        // Switching views starts clean. Selection used to survive it: a
        // half-written create reappeared on the board as an overlay, and a
        // stale `?selected=` re-opened a detail beside a board you had only
        // just arrived at. Both read as the board opening things by itself.
        // The list re-picks its first row on its own; the board waits for a click.
        setSel(null);
        go({ view: v === 'board' ? 'board' : null, status: null, page: null, selected: null });
      }}
      aria-label="View"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List />
      </ToggleGroupItem>
      <ToggleGroupItem value="board" aria-label="Board view">
        <SquareKanban />
      </ToggleGroupItem>
    </ToggleGroup>
  );

  // ONE detail pane, shared by the list and the board. The board used to get a
  // right-hand Sheet instead, which meant two implementations of the same three
  // states and a create form that looked different depending on the view you
  // happened to be in.
  const detailPane =
    sel?.mode === 'create' ? (
      <div className="p-6">
        <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-primary-ink" aria-hidden />
            <h2 className="text-lg font-semibold">New task</h2>
          </div>
          <TaskForm
            initial={emptyTaskForm()}
            submitLabel="Save task"
            submitting={pending}
            onSubmit={createTask}
            onCancel={() => setSel(tasks[0] ? { mode: 'view', id: tasks[0].id } : null)}
          />
        </div>
      </div>
    ) : selected ? (
      <TaskDetail
        key={selected.id}
        task={selected}
        onToggleStatus={() => toggleStatus(selected)}
        onSave={(payload) => patchTask(selected.id, payload)}
        onPatch={(patch) => patchTask(selected.id, patch)}
        onDelete={() => removeTask(selected.id)}
      />
    ) : (
      <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
        Select a task, or add a new one.
      </div>
    );

  if (isBoard) {
    const boardPane = (
      <>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tasks
          </h2>
          <div className="relative ml-2 min-w-40 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
              className="h-9 pl-8"
            />
          </div>
          <Select
            value={priority}
            onValueChange={(v) => go({ priority: v === 'all' ? null : v, page: null })}
          >
            <SelectTrigger className="h-9 w-36" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {viewToggle}
            <Button type="button" size="sm" onClick={() => setSel({ mode: 'create' })}>
              <Plus /> New
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto md:flex md:flex-col md:overflow-hidden">
          <TaskBoard
            tasks={tasks}
            selectedId={sel?.mode === 'view' ? sel.id : null}
            onSelect={(id) => setSel({ mode: 'view', id })}
            onMove={moveTask}
          />
        </div>
        {/* The board loads one capped page — say so rather than truncating
              silently (the task_list tool's `truncated` flag, UI edition). */}
        {(boardQuery.data?.total ?? 0) > (boardQuery.data?.tasks.length ?? 0) && (
          <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            Showing {boardQuery.data?.tasks.length} of {boardQuery.data?.total} tasks — narrow with
            search or a priority filter to see the rest.
          </p>
        )}
      </>
    );

    // Nothing open: the board gets the whole screen. Reserving 672px for an
    // empty "select a task" panel would hand half the board away for nothing,
    // and switching to this view is not a request to open a form.
    if (sel === null) return <div className="flex h-full min-h-0 flex-col">{boardPane}</div>;

    // Form on the LEFT, board on the right: the board reads left-to-right
    // across its columns, so the form belongs where that sweep starts. The
    // board takes the slack and the form keeps its fixed width. Its own
    // persistence id — a Kanban board wants far more room than a 340px task
    // list, so the two views must not share a width.
    return (
      <MasterDetail id="tasks-board" listFills detailFirst list={boardPane} detail={detailPane} />
    );
  }

  return (
    <MasterDetail
      id="tasks"
      list={
        <>
          {/* ── Left: task list ──────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tasks
            </h2>
            <div className="flex items-center gap-2">
              {viewToggle}
              <Button type="button" size="sm" onClick={() => setSel({ mode: 'create' })}>
                <Plus /> New
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tasks…"
                className="h-9 pl-8"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={statusParam}
                onValueChange={(v) => go({ status: v === 'active' ? null : v, page: null })}
              >
                <SelectTrigger className="h-9 flex-1" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All status</SelectItem>
                  {/* Archive is a separate axis from status, but it belongs in
                      the same "what am I looking at" control rather than a
                      third dropdown in an already crowded bar. */}
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={priority}
                onValueChange={(v) => go({ priority: v === 'all' ? null : v, page: null })}
              >
                <SelectTrigger className="h-9 flex-1" aria-label="Filter by priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2 p-3 md:flex-1 md:overflow-y-auto md:scrollbar-thin">
            {tasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                {filtering ? (
                  'No tasks match your search or filters.'
                ) : (
                  <>
                    No tasks yet. Click <strong>New</strong> to add one.
                  </>
                )}
              </p>
            ) : (
              tasks.map((t) => {
                const isSel = sel?.mode === 'view' && sel.id === t.id;
                const done = t.status === 'done';
                const overdue = !!t.dueAt && new Date(t.dueAt) < new Date() && !done;
                const todosDone = t.todos.filter((x) => x.done).length;
                return (
                  <ListCard
                    key={t.id}
                    asChild
                    selected={isSel}
                    className={cn(
                      'flex items-start gap-2.5',
                      t.priority === 'high' && !isSel && 'border-destructive',
                    )}
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleStatus(t)}
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                          done
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted',
                        )}
                        aria-label={done ? 'Mark not done' : 'Mark done'}
                        aria-pressed={done}
                      >
                        {done && <Check className="size-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSel({ mode: 'view', id: t.id })}
                        data-mark-id={t.id}
                        data-mark-kind="task"
                        data-mark-label={t.title}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              'truncate text-sm font-medium',
                              done && 'text-muted-foreground line-through',
                            )}
                          >
                            {t.title}
                          </span>
                          {t.dueAt && (
                            <span
                              className={cn(
                                'ml-auto shrink-0 text-xs tabular-nums',
                                overdue
                                  ? 'font-medium text-destructive-ink'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {dueLabel(t.dueAt, { todayAsTime: true })}
                            </span>
                          )}
                        </div>
                        {(t.body || t.summary) && (
                          <ListCardSnippet className="line-clamp-1">
                            {t.body || t.summary}
                          </ListCardSnippet>
                        )}
                        {(t.status === 'in_progress' ||
                          t.status === 'blocked' ||
                          t.todos.length > 0 ||
                          t.commentCount > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {(t.status === 'in_progress' || t.status === 'blocked') && (
                              <span>{STATUS_LABEL[t.status]}</span>
                            )}
                            {t.todos.length > 0 && (
                              <span className="tabular-nums">
                                {todosDone}/{t.todos.length} steps
                              </span>
                            )}
                            {t.commentCount > 0 && (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <MessageSquare className="size-3" />
                                {t.commentCount}
                              </span>
                            )}
                          </div>
                        )}
                        {t.tags.length > 0 && (
                          <ListCardTags>
                            {t.tags.map((tag) => (
                              <TagPill key={tag} tag={tag} />
                            ))}
                          </ListCardTags>
                        )}
                      </button>
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
            pending={navPending}
            onGo={(p) => go({ page: p > 1 ? p : null })}
          />
        </>
      }
      detail={detailPane}
    />
  );
}
