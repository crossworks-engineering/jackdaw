/**
 * The dotted guides of a folder tree (/apps, /files): from each child a └ or
 * ├ back to its parent, and a │ down every ancestor level that still has
 * siblings to come. Absolutely placed inside a `relative` row, so the row
 * keeps its own layout and only offsets its content by the indent.
 */
import type { ReactNode } from 'react';

/** px per nesting level; the guide for level d sits at d*INDENT + ROW_PAD + 9. */
export const TREE_INDENT = 20;
/** px before the first tile. */
export const TREE_ROW_PAD = 8;

const LINE = 'pointer-events-none absolute border-dotted border-muted-foreground/45';

export function TreeGuides({
  depth,
  isLast,
  guides,
}: {
  depth: number;
  /** Last child of its parent: the elbow stops at the row's middle. */
  isLast: boolean;
  /** Per ancestor level, whether that ancestor was the last child of ITS
   *  parent; a level whose ancestor was last draws no continuing line. */
  guides: readonly boolean[];
}) {
  const out: ReactNode[] = [];
  for (let c = 0; c < depth; c++) {
    const x = TREE_ROW_PAD + c * TREE_INDENT + 9;
    if (c === depth - 1) {
      out.push(
        <span
          key={`v${c}`}
          aria-hidden
          className={`${LINE} top-0 border-l-[1.5px]`}
          style={{ left: x, height: isLast ? '50%' : '100%' }}
        />,
        <span
          key={`h${c}`}
          aria-hidden
          className={`${LINE} top-1/2 border-t-[1.5px]`}
          style={{ left: x, width: TREE_INDENT - 9 }}
        />,
      );
    } else if (!guides[c + 1]) {
      out.push(
        <span
          key={`v${c}`}
          aria-hidden
          className={`${LINE} inset-y-0 border-l-[1.5px]`}
          style={{ left: x }}
        />,
      );
    }
  }
  return <>{out}</>;
}
