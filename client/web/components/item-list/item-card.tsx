'use client';

import { forwardRef, type ComponentProps, type ReactNode, type Ref } from 'react';
import { Button } from '@mantle/web-ui/ui/button';
import { ListCard, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { cn } from '@mantle/web-ui/lib/utils';
import { formatDateTime, updatedAgo } from '@mantle/web-ui/lib/format-datetime';

/**
 * THE item card of every list screen (item-list alignment): the admin /pages
 * card, made one component so pages, notes, tables, files, drawings, the
 * member workspace and the client portal stop keeping their own.
 *
 * Anatomy (Jason, /pages 2026-08-19, kept): the TITLE gets the full width and
 * wraps; everything else sits in a FOOTER row inside the card so nothing
 * crowds it. The footer's start holds the drag handle and the updated stamp
 * (or a sub-page link); its end holds the state pill, then the actions. A
 * viewer who may not take an action simply gets no button for it.
 *
 * The whole card selects: summary, tags and the dead space between, not just
 * the title row. Real controls inside keep their own clicks, and a text
 * selection (someone copying the summary) never fires a selection on
 * mouse-up. Keyboard access rides the title button.
 */
export function ItemCard({
  id,
  kind,
  title,
  icon,
  badge,
  selected,
  dimmed,
  highlight,
  onSelect,
  footerStart,
  updatedAt,
  pill,
  actions,
  children,
  dropRef,
}: {
  id: string;
  /** The marking system's kind (`data-mark-kind`): page, note, table, … */
  kind: string;
  title: string;
  /** The leading glyph: an `<ItemIcon>`. */
  icon: ReactNode;
  /** Beside the title, e.g. the AudienceBadge. */
  badge?: ReactNode;
  selected?: boolean;
  dimmed?: boolean;
  /** A drop target under the pointer (drag-to-nest). */
  highlight?: boolean;
  onSelect: () => void;
  /** The footer's start. Default: the updated stamp from `updatedAt`. */
  footerStart?: ReactNode;
  updatedAt?: string;
  /** The state pill (`<StatePill>`), left of the actions. */
  pill?: ReactNode;
  /** Icon buttons (`<ItemCardAction>`), last in the footer. */
  actions?: ReactNode;
  /** Between the title and the footer: location, summary, tags. */
  children?: ReactNode;
  dropRef?: Ref<HTMLDivElement>;
}) {
  return (
    <ListCard asChild selected={selected} dimmed={dimmed}>
      <div
        ref={dropRef}
        data-item-id={id}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
          if (window.getSelection()?.toString()) return;
          onSelect();
        }}
        className={cn(
          'cursor-pointer space-y-1.5',
          highlight && 'border-primary bg-primary/10 ring-1 ring-primary',
        )}
      >
        {/* Keeps the marking attributes the marking system reads: moving them
            off this element silently breaks it. */}
        <RowButton
          onClick={onSelect}
          data-mark-id={id}
          data-mark-kind={kind}
          data-mark-label={title}
          className="flex w-full items-start gap-2"
        >
          {icon}
          <ListCardTitle wrap className="min-w-0 flex-1">
            {title || 'Untitled'}
          </ListCardTitle>
          {badge}
        </RowButton>

        {children}

        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1">
            {footerStart ?? (updatedAt ? <UpdatedStamp at={updatedAt} /> : null)}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {pill}
            {actions ? <div className="flex items-center">{actions}</div> : null}
          </div>
        </div>
      </div>
    </ListCard>
  );
}

/** The leading glyph: the item's emoji when it has one, else the kind's. */
export function ItemIcon({ emoji, fallback }: { emoji?: string | null; fallback: ReactNode }) {
  if (emoji) {
    return (
      <span className="mt-px size-4 shrink-0 text-center text-sm leading-5" aria-hidden>
        {emoji}
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-4"
      aria-hidden
    >
      {fallback}
    </span>
  );
}

/** Relative while fresh, the date once it is 5+ days old (updatedAgo); the
 *  exact time on hover. */
export function UpdatedStamp({ at }: { at: string }) {
  return (
    <span
      className="truncate px-1 py-0.5 text-xs text-muted-foreground"
      title={`Updated ${formatDateTime(at)}`}
    >
      {updatedAgo(at)}
    </span>
  );
}

/** A footer icon button. `destructive` reddens on hover (Delete). Forwards
 *  its ref, so it works as a `DropdownMenuTrigger asChild`. */
export const ItemCardAction = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & { destructive?: boolean; label: string }
>(function ItemCardAction({ destructive, label, className, title, ...props }, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={title ?? label}
      className={cn(
        'size-7 text-muted-foreground',
        destructive && 'hover:text-destructive-ink',
        className,
      )}
      {...props}
    />
  );
});
