'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Flag, Pencil, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mantle/web-ui/ui/select';
import { cn } from '@mantle/web-ui/lib/utils';
import { formatDateTime } from '@mantle/web-ui/lib/format-datetime';
import { TagPill } from '@mantle/web-ui/tag-pill';
import { ShareControl } from '@/components/share-control';
import { TaskForm, taskToForm, type TaskPayload } from './task-form';
import { PRIORITY_BADGE, STATUSES, STATUS_BADGE, STATUS_LABEL, type Status } from './task-meta';
import { TaskTodos } from './task-todos';
import { TaskComments } from './task-comments';
import type { TaskRow, TaskTodo } from '@mantle/client-types';

// Wire shape is the GET /api/tasks mapper's output — single source of truth.
// Re-exported so the list client keeps importing it from here; a drift between
// the @mantle/content row and what this screen renders is now a compile error.
export type { TaskRow };
export type { Status };

/** A partial task write (status move, todos edit) — subset of the form payload. */
export type TaskPatch = Partial<TaskPayload> & { todos?: TaskTodo[] };

/**
 * Presentational task detail — the client owns the tasks list + all fetches and
 * passes the fresh row + callbacks, so a status toggle from the list card and an
 * edit here stay in sync. Manages only its own edit-mode flag.
 */
export function TaskDetail({
  task,
  onToggleStatus,
  onSave,
  onPatch,
  onDelete,
}: {
  task: TaskRow;
  onToggleStatus: () => void;
  onSave: (payload: TaskPayload) => Promise<boolean>;
  onPatch: (patch: TaskPatch) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const done = task.status === 'done';
  const overdue = !!task.dueAt && new Date(task.dueAt) < new Date() && !done;

  if (editing) {
    return (
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Edit task</h2>
        <TaskForm
          initial={taskToForm(task)}
          submitLabel="Save task"
          onSubmit={async (payload) => {
            if (await onSave(payload)) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleStatus}
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors',
            done
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input hover:bg-muted',
          )}
          aria-label={done ? 'Mark open' : 'Mark done'}
          aria-pressed={done}
        >
          {done && <Check className="size-4" />}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h2
              className={cn(
                'min-w-0 text-xl font-semibold',
                done && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <ShareControl nodeId={task.id} iconOnly teamMode />
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive-ink hover:text-destructive-ink"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Select
              value={task.status}
              onValueChange={(status) => void onPatch({ status: status as Status })}
            >
              <SelectTrigger
                aria-label="Status"
                className={cn(
                  'h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 text-xs',
                  STATUS_BADGE[task.status],
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                PRIORITY_BADGE[task.priority],
              )}
            >
              <Flag className="size-3" /> {task.priority}
            </span>
            {task.dueAt && (
              <span
                className={cn(
                  overdue ? 'font-medium text-destructive-ink' : 'text-muted-foreground',
                )}
              >
                · due {formatDateTime(task.dueAt)}
                {overdue && ' · overdue'}
              </span>
            )}
          </div>

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <TagPill key={t} tag={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      {task.body && (
        <article className="prose prose-sm dark:prose-invert max-w-none prose-accent rounded-md border border-border bg-card p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.body}</ReactMarkdown>
        </article>
      )}

      <TaskTodos todos={task.todos} onChange={(todos) => void onPatch({ todos })} />

      {task.summary && (
        <p className="text-xs italic text-muted-foreground">Indexed: {task.summary}</p>
      )}

      <TaskComments taskId={task.id} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{task.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteOpen(false);
                onDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
