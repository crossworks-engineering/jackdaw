'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ban, CheckSquare, Flag, MessageSquare } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { ListCard, ListCardTags } from '@mantle/web-ui/ui/list-card';
import { TagPill } from '@mantle/web-ui/tag-pill';
import type { TaskRow, TaskStatus } from '@mantle/client-types';
import { rankBetween } from '@/lib/rank';
import {
  BOARD_COLUMNS,
  STATUS_BADGE,
  STATUS_DOT,
  STATUS_LABEL,
  boardColumnFor,
  statusForDrop,
  dueLabel,
  type BoardColumn,
} from './task-meta';

/** A card was dropped: move `taskId` to `status`, ordered at `rank`. */
export type BoardMove = { taskId: string; status: TaskStatus; rank: string };

const COL_PREFIX = 'col-';

function BoardCard({
  task,
  selected,
  onSelect,
  dragging,
}: {
  task: TaskRow;
  selected: boolean;
  onSelect?: () => void;
  dragging?: boolean;
}) {
  const done = task.status === 'done';
  const overdue = !!task.dueAt && new Date(task.dueAt) < new Date() && !done;
  const todosDone = task.todos.filter((t) => t.done).length;
  return (
    <ListCard
      asChild
      selected={selected}
      className={cn(
        'cursor-grab p-3',
        task.priority === 'high' && !selected && 'border-destructive',
        dragging && 'opacity-90 shadow-lg',
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        }}
        data-mark-id={task.id}
        data-mark-kind="task"
        data-mark-label={task.title}
      >
        <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>
          {task.title}
        </p>
        {(task.dueAt ||
          task.todos.length > 0 ||
          task.commentCount > 0 ||
          task.priority === 'high' ||
          task.status === 'blocked') && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {/* The board has no Blocked column, so the card has to say so. It
                leads the meta row: "this is stuck" outranks when it is due. */}
            {task.status === 'blocked' && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
                  STATUS_BADGE.blocked,
                )}
              >
                <Ban className="size-3" /> Blocked
              </span>
            )}
            {task.priority === 'high' && (
              <span className="inline-flex items-center gap-1 text-destructive-ink">
                <Flag className="size-3" /> high
              </span>
            )}
            {task.dueAt && (
              <span className={cn('tabular-nums', overdue && 'font-medium text-destructive-ink')}>
                {dueLabel(task.dueAt)}
              </span>
            )}
            {task.todos.length > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CheckSquare className="size-3" />
                {todosDone}/{task.todos.length}
              </span>
            )}
            {task.commentCount > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <MessageSquare className="size-3" />
                {task.commentCount}
              </span>
            )}
          </div>
        )}
        {task.tags.length > 0 && (
          <ListCardTags>
            {task.tags.slice(0, 4).map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </ListCardTags>
        )}
      </div>
    </ListCard>
  );
}

function SortableCard({
  task,
  selected,
  onSelect,
}: {
  task: TaskRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <BoardCard task={task} selected={selected} onSelect={onSelect} />
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  selectedId,
  onSelect,
}: {
  status: TaskStatus;
  tasks: TaskRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${status}` });
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col rounded-lg border border-border bg-muted/30 md:min-h-0',
        isOver && 'ring-1 ring-primary',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn('size-2 rounded-full', STATUS_DOT[status])} aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {STATUS_LABEL[status]}
        </h3>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard
              key={t.id}
              task={t}
              selected={selectedId === t.id}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Drop tasks here
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Kanban view — one column per status, drag between/within columns. Ordering
 * uses the server's fractional `rank` (mirrored in lib/rank.ts): a drop PATCHes
 * ONE task with `{status, rank}`; the parent owns the optimistic update.
 */
export function TaskBoard({
  tasks,
  selectedId,
  onSelect,
  onMove,
}: {
  tasks: TaskRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (move: BoardMove) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sort each column by rank here (nulls last, otherwise keep server order) so
  // an optimistic rank write reorders immediately — the parent's local list
  // mutates a row in place, it doesn't re-sort.
  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((status) => ({
        status,
        tasks: tasks
          .filter((t) => boardColumnFor(t.status) === status)
          .slice()
          .sort((a, b) => {
            if (a.rank && b.rank) return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
            if (a.rank) return -1;
            if (b.rank) return 1;
            return 0; // both unranked — stable, keep server order
          }),
      })),
    [tasks],
  );

  const activeTask = activeId ? (tasks.find((t) => t.id === activeId) ?? null) : null;

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    // Two different things, deliberately kept apart: which COLUMN the card
    // landed in (drives the rank neighbours) and which STATUS to write.
    let targetColumn: BoardColumn;
    let insertBeforeId: string | null = null;
    const overId = String(over.id);
    if (overId.startsWith(COL_PREFIX)) {
      targetColumn = overId.slice(COL_PREFIX.length) as BoardColumn;
    } else {
      // Dropped back onto itself: a no-op, NOT "append to end" (review catch).
      if (overId === task.id) return;
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      targetColumn = boardColumnFor(overTask.status);
      insertBeforeId = overTask.id;
    }

    const targetStatus = statusForDrop(task.status, targetColumn);

    // Neighbours come from the RENDERED (rank-sorted) column, not the raw
    // list — after an optimistic drag the two orders diverge and raw-order
    // neighbours produce inverted bounds / duplicate keys (review catch).
    const rendered = columns.find((c) => c.status === targetColumn)?.tasks ?? [];
    const col = rendered.filter((t) => t.id !== task.id);
    const insertAt = insertBeforeId ? col.findIndex((t) => t.id === insertBeforeId) : col.length;
    if (insertAt < 0) return;
    // Nearest RANKED neighbours around the insertion point — unranked (null)
    // cards sort after every ranked one, so they act as an open upper end.
    let prevRank: string | null = null;
    for (let i = insertAt - 1; i >= 0; i--) {
      const r = col[i]?.rank;
      if (r) {
        prevRank = r;
        break;
      }
    }
    const nextRank: string | null = col[insertAt]?.rank ?? null;
    let rank: string;
    try {
      rank = rankBetween(prevRank, nextRank);
    } catch {
      // Bounds out of order (stale board state) — drop at the column end.
      rank = rankBetween(prevRank, null);
    }
    onMove({ taskId: task.id, status: targetStatus, rank });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid flex-1 grid-cols-1 gap-3 p-3 md:min-h-0 md:grid-cols-3">
        {columns.map((col) => (
          <BoardColumn
            key={col.status}
            status={col.status}
            tasks={col.tasks}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <BoardCard task={activeTask} selected={false} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
