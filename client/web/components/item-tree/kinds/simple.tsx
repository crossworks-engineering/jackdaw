import type { LucideIcon } from 'lucide-react';
import { FileText, KeyRound, PenTool, Sigma, Table2, UserRound } from 'lucide-react';
import type { TreeItem, TreeKind } from '@mantle/web-ui/types/tree';
import { StatePill } from '@/components/item-list/state-pill';
import { AudienceBadge } from '@/components/share/audience-badge';
import type { TreeKindAdapter } from './types';

/**
 * The kinds whose rows need nothing of their own: the kind's glyph, the title,
 * then the state pill or the level, and the short `subtype` token when the
 * brain sends one (a secret's kind).
 */
function simpleAdapter(
  kind: TreeKind,
  noun: TreeKindAdapter['noun'],
  Icon: LucideIcon,
): TreeKindAdapter {
  return {
    kind,
    noun,
    lead: () => (
      <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center">
        <Icon className="size-4 text-muted-foreground" />
      </span>
    ),
    status: (item) => <SimpleStatus item={item} />,
  };
}

function SimpleStatus({ item }: { item: TreeItem }) {
  return (
    <>
      {item.state ? (
        <StatePill state={item.state} className="px-1.5 py-0 text-[10px]" />
      ) : (
        <AudienceBadge level={item.level} className="px-1.5 py-0 text-[10px]" />
      )}
      {item.subtype && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {item.subtype}
        </span>
      )}
    </>
  );
}

export const notesAdapter = simpleAdapter('notes', { one: 'note', many: 'notes' }, FileText);
export const drawAdapter = simpleAdapter('draw', { one: 'drawing', many: 'drawings' }, PenTool);
export const tablesAdapter = simpleAdapter('tables', { one: 'table', many: 'tables' }, Table2);
export const formulasAdapter = simpleAdapter(
  'formulas',
  { one: 'formula', many: 'formulas' },
  Sigma,
);
export const contactsAdapter = simpleAdapter(
  'contacts',
  { one: 'contact', many: 'contacts' },
  UserRound,
);
export const secretsAdapter = simpleAdapter(
  'secrets',
  { one: 'secret', many: 'secrets' },
  KeyRound,
);
