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
  normal: 'bg-muted text-foreground',
  high: 'bg-destructive/15 text-destructive-ink',
};
