import type { TaskPriority, TaskStatus } from '@mantle/client-types';

/**
 * Task vocabulary shared by the list, board, detail and form. The const
 * arrays are `satisfies`-pinned to the wire unions, so a server-side status
 * addition that isn't mirrored here is a compile error, not a silent gap.
 */

export const STATUSES = [
  'open',
  'in_progress',
  'blocked',
  'done',
] as const satisfies readonly TaskStatus[];

export const PRIORITIES = ['low', 'normal', 'high'] as const satisfies readonly TaskPriority[];

/**
 * The board's columns — three, not four. `blocked` has no column of its own:
 * it is a flag on work already under way, not a further stage, and a fourth
 * column cost more width than it earned. Set it from the task form.
 */
export const BOARD_COLUMNS = [
  'open',
  'in_progress',
  'done',
] as const satisfies readonly TaskStatus[];

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/**
 * Which column a task renders in. Blocked work sits under In progress, with a
 * badge on the card — it must land SOMEWHERE, or dropping the column would
 * make blocked tasks vanish from the board rather than merely lose a heading.
 */
export function boardColumnFor(status: TaskStatus): BoardColumn {
  return status === 'blocked' ? 'in_progress' : status;
}

/**
 * The status a drop should WRITE, which is not always the column it landed in.
 *
 * Blocked cards render under In progress, so a plain reorder inside that column
 * would otherwise post `in_progress` and silently unblock the task — the board
 * would be clearing the flag as a side effect of tidying. Dragging OUT of the
 * column is still a real status change; blocked is cleared from the form.
 */
export function statusForDrop(current: TaskStatus, column: BoardColumn): TaskStatus {
  return current === 'blocked' && column === 'in_progress' ? 'blocked' : column;
}

export type Priority = TaskPriority;
export type Status = TaskStatus;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

/** Badge classes per status — literal map (Tailwind v4: no dynamic classes). */
export const STATUS_BADGE: Record<TaskStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/15 text-info-ink',
  blocked: 'bg-warning/15 text-warning-ink',
  done: 'bg-success/15 text-success-ink',
};

/** Column-header dot per status (fills, never text ink). */
export const STATUS_DOT: Record<TaskStatus, string> = {
  open: 'bg-muted-foreground',
  in_progress: 'bg-info',
  blocked: 'bg-warning',
  done: 'bg-success',
};

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-muted text-muted-foreground',
  high: 'bg-destructive/15 text-destructive-ink',
};

/** Relative due-date stamp shared by the list cards and the board cards.
 *  `todayAsTime` renders a same-day due as its clock time (the list); the
 *  board's tighter cards say just "today". */
export function dueLabel(iso: string, opts: { todayAsTime?: boolean } = {}): string {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (Math.abs(days) < 1) {
    if (!opts.todayAsTime) return 'today';
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days < 7) return `in ${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
