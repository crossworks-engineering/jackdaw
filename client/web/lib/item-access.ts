/**
 * What the brain says a login may do with one item, as the item screens read
 * it (workspaces W6b, fix round contract change 1): a snapshot copy of an
 * accepted item (the author's copy, kept in its private or Former user
 * workspace) is read only, even for its author. The brain marks it with
 * `readOnly: true` on the item's response; a brain before that change marks
 * it only in the item's data (`snapshot_of`), which an item response may
 * carry as `snapshotOf`. Absent: the brain decides each write, and a refusal
 * shows in its own words.
 *
 * Pure: pinned by item-access.test.ts.
 */

/** The note an item screen shows on a snapshot copy. */
export const SNAPSHOT_COPY_NOTE =
  'This is your copy of an item that was accepted into the brain. It is read only. You can delete it.';

/** Whether the item is read only for this login: no editor, no move, no
 *  share; the author may still delete a snapshot copy. */
export function isReadOnlyItem(item: object | null | undefined): boolean {
  if (!item) return false;
  const it = item as { readOnly?: unknown; snapshotOf?: unknown };
  return it.readOnly === true || (typeof it.snapshotOf === 'string' && it.snapshotOf !== '');
}
