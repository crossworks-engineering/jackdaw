/**
 * Two lists, each already in `compare` order, as one list in that order
 * (stable: on a tie `a` comes first, then each list keeps its own order).
 * For a list the client holds whole (the /pages tree's top level, the files
 * root) where the admin's private rows join the brain's; paged lists are
 * merged by the brain instead.
 */
export function mergeSortedRows<T>(
  a: readonly T[],
  b: readonly T[],
  compare: (x: T, y: T) => number,
): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (compare(b[j]!, a[i]!) < 0) out.push(b[j++]!);
    else out.push(a[i++]!);
  }
  while (i < a.length) out.push(a[i++]!);
  while (j < b.length) out.push(b[j++]!);
  return out;
}
