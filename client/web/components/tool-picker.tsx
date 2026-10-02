'use client';

/**
 * A tool group's membership list (Settings > Tool groups > a group): every
 * tool in the brain, grouped by handler kind, each with a switch, and a filter
 * above it. On a brain with hundreds of tools the filter is how an admin finds
 * one: text over slug, name, description and handler kind, and All / In this
 * group / Not in this group.
 *
 * The filter only hides rows. `ToggleList` gets the WHOLE selection, so a
 * switch flipped while filtered keeps every ticked tool the filter hides.
 *
 * `readOnly` lists the group's own tools with the same text filter and no
 * switches, for a list something else owns (a connector group's).
 *
 * The filter state is local: the editor keys this per group, so opening
 * another group starts with an empty filter.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { ToggleList, type ToggleListItem } from '@/components/toggle-list';
import { filterMembership, type MembershipScope } from '@/lib/tool-membership';

export type ToolOption = {
  slug: string;
  name: string;
  description: string;
  requiresConfirm: boolean;
  kind: string;
};

type PickerProps = {
  available: ToolOption[];
  selected: string[];
  onChange?: (next: string[]) => void;
  /** No switches: the group's own tools only, filtered by text. */
  readOnly?: boolean;
};

export function ToolPicker(props: PickerProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<MembershipScope>('all');
  return (
    <ToolPickerView {...props} query={query} onQuery={setQuery} scope={scope} onScope={setScope} />
  );
}

const SCOPES: readonly { value: MembershipScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In this group' },
  { value: 'out', label: 'Not in this group' },
];

/** The picker without its state, so a test can render any filter. */
export function ToolPickerView({
  available,
  selected,
  onChange,
  readOnly = false,
  query,
  onQuery,
  scope,
  onScope,
}: PickerProps & {
  query: string;
  onQuery: (value: string) => void;
  scope: MembershipScope;
  onScope: (value: MembershipScope) => void;
}) {
  // Read-only: the group's own tools, a slug the brain no longer lists kept
  // as a bare slug so it is still there to see.
  const bySlug = new Map(available.map((t) => [t.slug, t]));
  const rows: ToolOption[] = readOnly
    ? selected.map(
        (slug) =>
          bySlug.get(slug) ?? {
            slug,
            name: slug,
            description: '',
            requiresConfirm: false,
            kind: '',
          },
      )
    : available;
  const effectiveScope = readOnly ? 'all' : scope;
  const shown = filterMembership(rows, selected, query, effectiveScope);
  const filtering = query.trim() !== '' || effectiveScope !== 'all';
  const word = rows.length === 1 ? 'tool' : 'tools';
  const count = filtering ? `${shown.length} of ${rows.length} ${word}` : `${rows.length} ${word}`;
  const inGroup = available.filter((t) => selected.includes(t.slug)).length;
  const clear = () => {
    onQuery('');
    onScope('all');
  };

  const items: ToggleListItem[] = shown.map((t) => ({
    value: t.slug,
    label: t.name,
    description: t.description,
    group: t.kind,
    meta: (
      <>
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
          {t.slug}
        </code>
        {t.requiresConfirm && (
          <span className="rounded bg-warning/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-warning-ink">
            confirm
          </span>
        )}
      </>
    ),
  }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            size="xs"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              // The list sits in the group's form: Enter must not save it.
              if (e.key === 'Enter') e.preventDefault();
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                onQuery('');
              }
            }}
            placeholder="Filter tools…"
            aria-label="Filter tools in this group"
            className="pl-8"
          />
        </div>
        {!readOnly && (
          <div
            role="group"
            aria-label="Show tools"
            className="flex shrink-0 items-center rounded-md border border-input p-0.5 text-xs"
          >
            {SCOPES.map((s) => (
              <RowButton
                key={s.value}
                onClick={() => onScope(s.value)}
                aria-pressed={scope === s.value}
                className={cn(
                  'rounded px-2 py-1 font-medium transition-colors',
                  scope === s.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
                {s.value !== 'all' && (
                  <span className="ml-1 tabular-nums opacity-70">
                    {s.value === 'in' ? inGroup : available.length - inGroup}
                  </span>
                )}
              </RowButton>
            ))}
          </div>
        )}
        <span role="status" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tools in this group.</p>
      ) : shown.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
          <p>No tools match</p>
          {filtering && (
            <Button type="button" variant="outline" size="xs" className="mt-2" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
      ) : readOnly ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
          {shown.map((t) => (
            <li key={t.slug} className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="truncate font-mono text-xs">{t.slug}</span>
              {t.name !== t.slug && (
                <span className="truncate text-xs text-muted-foreground">{t.name}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ToggleList
          items={items}
          // The whole selection, not the shown rows: see the header comment.
          selected={selected}
          onChange={(next) => onChange?.(next)}
          className="max-h-[55vh] overflow-auto scrollbar-thin"
        />
      )}
    </div>
  );
}
