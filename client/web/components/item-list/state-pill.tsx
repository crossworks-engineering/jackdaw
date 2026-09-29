import { cn } from '@mantle/web-ui/lib/utils';

/**
 * Where a row stands, as the small pill at the foot of an item card, left of
 * its actions (item-list alignment, D1). A state is a pill, not a place: the
 * lists show everything the reader can see, and this is how a row says it is
 * not (yet) the brain's. Brain items wear none.
 *
 * The same strings as the brain's `MemberItemPill` (the member one list) plus
 * the admin's `private`, which is one of them.
 */
export type ItemState = 'private' | 'draft' | 'submitted' | 'returned' | 'with-admin';

const LABEL: Record<ItemState, string> = {
  private: 'private',
  draft: 'draft',
  submitted: 'submitted',
  returned: 'returned',
  'with-admin': 'with admin',
};

/** What each pill means, on hover. */
const TITLE: Record<ItemState, string> = {
  private: 'Private: only you can see it',
  draft: 'A draft shared with the team',
  submitted: 'Submitted: waiting for an admin to review it',
  returned: 'Returned: an admin sent it back with a note',
  'with-admin': 'An admin is working on it',
};

/** Ink roles only (a status fill used as text can vanish on some themes). */
const TONE: Record<ItemState, string> = {
  private: 'border-muted-foreground/40 text-muted-foreground',
  draft: 'border-muted-foreground/40 text-muted-foreground',
  submitted: 'border-info/40 text-info-ink',
  returned: 'border-warning/50 text-warning-ink',
  'with-admin': 'border-muted-foreground/40 text-muted-foreground',
};

export function stateLabel(state: ItemState): string {
  return LABEL[state];
}

export function StatePill({ state, className }: { state: ItemState; className?: string }) {
  return (
    <span
      title={TITLE[state]}
      data-state={state}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        TONE[state],
        className,
      )}
    >
      {LABEL[state]}
    </span>
  );
}
