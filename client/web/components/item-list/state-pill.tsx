import { cn } from '@mantle/web-ui/lib/utils';

/**
 * Where a row stands, as the small pill at the foot of an item card, left of
 * its actions (item-list alignment, D1). A state is a pill, not a place: the
 * lists show everything the reader can see, and this is how a row says it is
 * not (yet) the brain's. Brain items wear none.
 *
 * Two states since W5c: `private` and `draft`. Review went with W5c, so
 * there is no submitted, rejected or with-admin pill.
 */
export type ItemState = 'private' | 'draft';

/** The pill a state wears. Any other state shows as a draft: a review state
 *  the item contract still names (no current row carries one), or a state a
 *  later brain adds. */
export function pillState(state: string): ItemState {
  return state === 'private' ? 'private' : 'draft';
}

const LABEL: Record<ItemState, string> = {
  private: 'private',
  draft: 'draft',
};

/** What each pill means, on hover. */
const TITLE: Record<ItemState, string> = {
  private: 'Private: only you can see it',
  draft: 'A draft shared with the team',
};

/** Ink roles only (a status fill used as text can vanish on some themes). */
const TONE: Record<ItemState, string> = {
  private: 'border-muted-foreground/40 text-muted-foreground',
  draft: 'border-muted-foreground/40 text-muted-foreground',
};

export function stateLabel(state: string): string {
  return LABEL[pillState(state)];
}

/** The hover words. */
export function stateTitle(state: string): string {
  return TITLE[pillState(state)];
}

export function StatePill({ state, className }: { state: string; className?: string }) {
  const shown = pillState(state);
  return (
    <span
      title={TITLE[shown]}
      data-state={shown}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4',
        TONE[shown],
        className,
      )}
    >
      {LABEL[shown]}
    </span>
  );
}
