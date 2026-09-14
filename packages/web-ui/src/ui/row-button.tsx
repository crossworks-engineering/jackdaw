'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../lib/utils';

/**
 * A clickable ROW: a list item, a table cell, a disclosure header — anything
 * where the whole strip is the target and its geometry comes from the layout
 * around it.
 *
 * `Button` is the wrong primitive for these and the style guide says why: it
 * carries a height, horizontal padding and centred content, and it forbids
 * hand-sizing those away. A disclosure header that is `h-10 px-4` with its
 * label centred is not the control anyone wanted, so forty-two call sites
 * reached for a raw `<button>` instead and lost the things the kit exists to
 * carry — chiefly the focus ring, which is the difference between a row a
 * keyboard user can see they are on and one they cannot.
 *
 * So this is deliberately almost nothing: the interaction contract, no box.
 *
 * - **The focus ring**, the same one every kit control draws.
 * - **Disabled** behaves like the kit's: pointer events off, dimmed.
 * - **`text-left`**, because a row reads from its left edge. `Button` centres.
 * - **`type="button"` by default.** A raw `<button>` inside a `<form>` defaults
 *   to `submit`, so a disclosure row in a form submitted it. Every converted
 *   call site had written `type="button"` by hand; one had not.
 * - Icon sizing matches `Button`, so a chevron in a row looks like a chevron
 *   anywhere else.
 *
 * Everything else — width, padding, gap, background, hover — is the caller's,
 * because it belongs to the layout this sits in.
 */
export interface RowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const RowButton = React.forwardRef<HTMLButtonElement, RowButtonProps>(
  ({ className, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        // `asChild` renders someone else's element — an anchor has no `type`,
        // and React warns about it — so the default only applies to a real
        // button. An explicit `type` always wins.
        {...(asChild ? {} : { type: type ?? 'button' })}
        className={cn(
          'select-none text-left ring-offset-background transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    );
  },
);
RowButton.displayName = 'RowButton';
