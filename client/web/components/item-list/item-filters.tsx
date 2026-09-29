'use client';

import { useState } from 'react';
import { AlignLeft, ArrowUpDown, Check, ChevronDown, ListFilter, Tag } from 'lucide-react';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@mantle/web-ui/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@mantle/web-ui/ui/popover';
import { Switch } from '@mantle/web-ui/ui/switch';
import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The filter row of every list pane (item-list alignment): quiet ghost
 * buttons, each opening its choices, never a row of blocks. Sort, the tag
 * filter (with the card density switch) and the State filter. Each writes
 * the URL through the screen's `go()`, so filtering is always a navigation
 * and never a filter over a loaded page.
 */

const TRIGGER = 'h-7 gap-1 px-2 text-muted-foreground';

export function SortMenu<S extends string>({
  value,
  labels,
  onChange,
}: {
  value: S;
  labels: Readonly<Record<S, string>>;
  onChange: (sort: S) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={TRIGGER} title="Sort">
          <ArrowUpDown className="size-3.5" />
          {labels[value]}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as S)}>
          {(Object.keys(labels) as S[]).map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {labels[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Which rows by state: All, or one pill (private, submitted, …), or a group
 * the screen names (Brain, By me). The first option is the default and reads
 * as unfiltered; any other lights the trigger.
 */
export function StateFilter<S extends string>({
  value,
  options,
  onChange,
  tourTarget,
}: {
  value: S;
  options: readonly { value: S; label: string }[];
  onChange: (state: S) => void;
  /** A product-tour anchor (`data-tour`) on the trigger. */
  tourTarget?: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const filtered = !!current && current.value !== options[0]?.value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(TRIGGER, filtered && 'text-foreground')}
          title="Filter by state"
          data-tour={tourTarget}
        >
          <ListFilter className="size-3.5" />
          {current?.label}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as S)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type TagCount = { tag: string; count: number };

/** Searchable tag filter: Popover + Command (cmdk) combobox; re-picking the
 *  active tag clears it. It also holds the card density switch, which is not
 *  about tags but must stay reachable on a brain that never used one, so it
 *  renders even with no tags. */
export function TagFilter({
  tags,
  activeTag,
  onSelect,
  details,
  onDetailsChange,
  allLabel = 'All tags',
}: {
  tags: TagCount[];
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
  details?: boolean;
  onDetailsChange?: (on: boolean) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const choose = (tag: string | null) => {
    onSelect(tag);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn(TRIGGER, activeTag && 'text-foreground')}
          title="Filter by tag, and choose how much of each card to show"
        >
          <Tag className="size-3.5" />
          <span className="max-w-32 truncate">{activeTag ?? 'All tags'}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        {/* ABOVE `<Command>`, not inside it: cmdk owns arrow keys and Enter
            for everything in its list. */}
        {onDetailsChange ? (
          <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Details
            <Switch
              checked={!!details}
              onCheckedChange={onDetailsChange}
              aria-label="Show summaries and tags on cards"
              title={
                details
                  ? 'Hide summaries and tags — titles only'
                  : 'Show summaries and tags on cards'
              }
              className="h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3"
            />
          </label>
        ) : null}
        <Command>
          <CommandInput placeholder="Search tags…" className="border-0 focus:ring-0" />
          <CommandList className="max-h-72 scrollbar-thin">
            <CommandEmpty className="px-3 py-6 text-center text-xs text-muted-foreground">
              No tags found.
            </CommandEmpty>
            <CommandGroup>
              {/* Sentinel value so a tag search doesn't accidentally match it. */}
              <CommandItem value="__all_items__" onSelect={() => choose(null)}>
                <Check className={cn('size-4', activeTag === null ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1">{allLabel}</span>
              </CommandItem>
              {tags.map((t) => (
                <CommandItem
                  key={t.tag}
                  value={t.tag}
                  onSelect={() => choose(activeTag === t.tag ? null : t.tag)}
                >
                  <Check
                    className={cn('size-4', activeTag === t.tag ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.tag}</span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground group-data-[selected=true]/command-item:text-accent-foreground">
                    {t.count}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The card density switch on its own, for a list with no tags (where
 *  the tag filter would otherwise hold it). */
export function DetailsToggle({
  details,
  onChange,
}: {
  details: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(TRIGGER, details && 'text-foreground')}
      aria-pressed={details}
      onClick={() => onChange(!details)}
      title={details ? 'Hide summaries — titles only' : 'Show summaries on cards'}
    >
      <AlignLeft className="size-3.5" />
      Details
    </Button>
  );
}

/** Clears an active filter (shown only while one is on). */
export function ClearFilter({ onClear, title }: { onClear: () => void; title: string }) {
  return (
    <Button variant="ghost" size="sm" className={TRIGGER} onClick={onClear} title={title}>
      Clear
    </Button>
  );
}
