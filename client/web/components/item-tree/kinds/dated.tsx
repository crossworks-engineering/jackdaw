import { CalendarDays, Check } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import type { TreeItem } from '@mantle/web-ui/types/tree';
import type { TreeKindAdapter } from './types';

/**
 * Tasks and events: rows that carry a date (the brain's `meta`).
 *
 * A task leads with its done box. It shows the state only: the whole row is
 * the button that opens the task, and a control inside it would be a button
 * in a button. Marking done is the row menu's and the task view's.
 */

/** A short due or start stamp: the clock time today, "3d ago", "in 3d", or
 *  the day and month. */
export function dateToken(iso: string, now = Date.now()): string {
  const at = new Date(iso);
  const days = Math.round((at.getTime() - now) / 86_400_000);
  if (Math.abs(days) < 1) {
    return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (days < 0 && days > -7) return `${-days}d ago`;
  if (days > 0 && days < 7) return `in ${days}d`;
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Past its due date and not done. */
export function isOverdue(item: TreeItem, now = Date.now()): boolean {
  const due = item.meta?.due;
  return !item.meta?.done && !!due && new Date(due).getTime() < now;
}

export const tasksAdapter: TreeKindAdapter = {
  kind: 'tasks',
  noun: { one: 'task', many: 'tasks' },
  lead: (item) => (
    <span
      aria-label={item.meta?.done ? 'Done' : 'Not done'}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-sm border',
        item.meta?.done
          ? 'border-success bg-success text-success-foreground'
          : 'border-muted-foreground/50',
      )}
    >
      {item.meta?.done && <Check className="size-3" aria-hidden />}
    </span>
  ),
  status: (item) => {
    const due = item.meta?.due;
    if (!due) return null;
    const overdue = isOverdue(item);
    return (
      <span
        title={`Due ${new Date(due).toLocaleString('en-GB')}`}
        className={cn(
          'flex items-center gap-1 text-[11px] tabular-nums',
          overdue ? 'text-destructive-ink' : 'text-muted-foreground',
        )}
      >
        {overdue && <span aria-hidden className="size-1.5 rounded-full bg-destructive" />}
        {dateToken(due)}
      </span>
    );
  },
};

export const eventsAdapter: TreeKindAdapter = {
  kind: 'events',
  noun: { one: 'event', many: 'events' },
  lead: () => (
    <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center">
      <CalendarDays className="size-4 text-muted-foreground" />
    </span>
  ),
  status: (item) => {
    const start = item.meta?.start;
    if (!start) return null;
    return (
      <span
        title={new Date(start).toLocaleString('en-GB')}
        className="text-[11px] tabular-nums text-muted-foreground"
      >
        {dateToken(start)}
      </span>
    );
  },
};
