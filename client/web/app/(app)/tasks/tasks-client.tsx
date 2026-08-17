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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@mantle/web-ui/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import { ListPager } from '@mantle/web-ui/layout/list-pager';
import { useListNav } from '@/lib/use-list-nav';
import { syncSelectionParam } from '@/lib/url-sync';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { useToast } from '@mantle/web-ui/ui/toast';
import { cn } from '@mantle/web-ui/lib/utils';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { ListCard } from '@mantle/web-ui/ui/list-card';
import { useRealtime } from '@/components/realtime/use-realtime';
import { TaskForm, emptyTaskForm, type TaskPayload } from './task-form';
import { TaskDetail, type TaskPatch, type TaskRow } from './task-detail';
import { TaskBoard, type BoardMove } from './task-board';
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
  const status = (searchParams.get('status')?.trim() || 'active') as Status | 'all' | 'active';
  const priority = (searchParams.get('priority')?.trim() || 'all') as Priority | 'all';
  const urlSelected = searchParams.get('selected')?.trim() || null;
  const view: 'list' | 'board' = searchParams.get('view') === 'board' ? 'board' : 'list';
  const isBoard = view === 'board';

  const listQuery = useQuery({
    queryKey: ['tasks', { q: query, status, priority, page }],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (query) qs.set('q', query);
      qs.set('status', status);
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
  // starts unselected (its detail opens in a sheet on click).
  const [sel, setSel] = useState<Selection>(urlSelected ? { mode: 'view', id: urlSelected } : null);
  useEffect(() => {
    if (isBoard || sel !== null) return;
    setSel(tasks[0] ? { mode: 'view', id: tasks[0].id } : { mode: 'create' });
  }, [tasks, sel, isBoard]);

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

  const filtering = !!query || status !== 'active' || priority !== 'all';
  const selected = sel?.mode === 'view' ? (tasks.find((t) => t.id === sel.id) ?? null) : null;

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

  const toggleStatus = (t: TaskRow) =>
    void patchTask(t.id, { status: t.status === 'done' ? 'open' : 'done' });

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
        if (v && v !== view) go({ view: v === 'board' ? 'board' : null, status: null, page: null });
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

  const detailSheet = (
    <Sheet open={sel !== null} onOpenChange={(open) => !open && setSel(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {sel?.mode === 'create' ? (
          <>
            <SheetHeader className="p-6 pb-0">
              <SheetTitle className="flex items-center gap-2">
                <ListTodo className="size-5 text-primary-ink" aria-hidden /> New task
              </SheetTitle>
            </SheetHeader>
            <div className="p-6 pt-4">
              <TaskForm
                initial={emptyTaskForm()}
                submitLabel="Save task"
                submitting={pending}
                onSubmit={createTask}
                onCancel={() => setSel(null)}
              />
            </div>
          </>
        ) : selected ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{selected.title}</SheetTitle>
            </SheetHeader>
            <TaskDetail
              key={selected.id}
              task={selected}
              onToggleStatus={() => toggleStatus(selected)}
              onSave={(payload) => patchTask(selected.id, payload)}
              onPatch={(patch) => patchTask(selected.id, patch)}
              onDelete={() => removeTask(selected.id)}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );

  if (isBoard) {
    return (
      <div className="flex h-full min-h-0 flex-col">
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
        {detailSheet}
      </div>
    );
  }

  return (
    <div className="md:grid md:h-full md:grid-cols-[340px_1fr] md:overflow-hidden">
      {/* ── Left: task list ──────────────────────────────────────── */}
      <div className="flex flex-col border-b border-border md:h-full md:min-h-0 md:border-b-0 md:border-r">
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
              value={status}
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
                      aria-label={done ? 'Mark open' : 'Mark done'}
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
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.body || t.summary}
                        </p>
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
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <TagPill key={tag} tag={tag} />
                          ))}
                        </div>
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
      </div>

      {/* ── Right: create | detail | empty ───────────────────────── */}
      <div className="relative md:h-full md:min-h-0 md:overflow-y-auto md:scrollbar-thin">
        {sel?.mode === 'create' ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <ListTodo className="size-5 text-primary-ink" aria-hidden />
              <h2 className="text-lg font-semibold">New task</h2>
            </div>
            <TaskForm
              initial={emptyTaskForm()}
              submitLabel="Save task"
              submitting={pending}
              onSubmit={createTask}
              onCancel={() =>
                setSel(tasks[0] ? { mode: 'view', id: tasks[0].id } : { mode: 'create' })
              }
            />
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
        )}
      </div>
    </div>
  );
}
