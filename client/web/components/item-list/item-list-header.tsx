'use client';

import { forwardRef, type ReactNode } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The top of every list pane (item-list alignment): the search box and the
 * screen's create actions on one row, the filter row under it. The admin
 * /pages header, made the one header. No source switch above it: a list shows
 * everything its reader can see, and a row's state is a pill on the card.
 */
export function ItemListHeader({
  heading,
  search,
  onSearch,
  placeholder,
  actions,
  children,
}: {
  /** A heading above the search row, for a screen with no page title of
   *  its own (the client portal). */
  heading?: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  /** Create actions beside the search: `<NewButton>`, an upload button. */
  actions?: ReactNode;
  /** The filter row: `<SortMenu>`, `<TagFilter>`, `<StateFilter>`. */
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border p-4">
      {heading}
      <div className="flex items-center gap-2">
        <ItemSearch value={search} onChange={onSearch} placeholder={placeholder} />
        {actions}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export const ItemSearch = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (value: string) => void; placeholder: string }
>(function ItemSearch({ value, onChange, placeholder }, ref) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/…$/, '')}
        className="pl-8"
      />
    </div>
  );
});

/** The header's create button. */
export function NewButton({
  onClick,
  busy = false,
  label = 'New',
  title,
}: {
  onClick: () => void;
  busy?: boolean;
  label?: string;
  title?: string;
}) {
  return (
    <Button onClick={onClick} disabled={busy} title={title}>
      {busy ? <Spinner /> : <Plus />}
      {label}
    </Button>
  );
}

/** The list's scroll area: the cards, spaced, dimmed while a navigation is
 *  in flight. `min-h-0` + `scrollbar-thin` per the master-detail rules. */
export function ItemListScroll({
  pending = false,
  className,
  children,
}: {
  pending?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-h-0 space-y-2 p-3 transition-opacity md:flex-1 md:overflow-y-auto md:scrollbar-thin',
        pending && 'opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The empty state inside the scroll area. */
export function ItemListEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
