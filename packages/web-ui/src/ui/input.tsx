import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const inputVariants = cva(
  // `aria-invalid:` paints the control itself on a failed validation. The
  // attribute is what a screen reader already reads, so styling off it
  // keeps the two in step: there is no way to show the red border without
  // also announcing the field as invalid.
  //
  // `text-base md:text-sm`, matching `Textarea`, on EVERY rung: iOS Safari
  // zooms the whole page in when a focused field's text is under 16px, and it
  // does not zoom back out — every tap on a form left the user pinching. 16px
  // on small screens, the app's `text-sm` from `md` up. A smaller rung buys
  // its height back from padding, never from the text, because the text is
  // the one part of a field that is the user's content rather than our chrome.
  // (This is where the scale parts company with `Button`, whose `xs` is
  // `text-xs`: a button's text is a label we wrote and can shrink.)
  'flex w-full rounded-md border border-input bg-transparent text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive md:text-sm',
  {
    variants: {
      // The rungs line up with `Button`'s labelled sizes at the same heights,
      // so a field and a button in one row match without either being
      // hand-sized. Before this existed there was only `h-10`, and a field
      // that needed to be smaller had to drop out of the kit entirely: the
      // table-grid pass left its ~30px popover search as a raw `<input>`
      // behind a sanctioned disable for exactly this reason, because a fixed
      // `h-10` is a third taller than the list it filters.
      //
      // There is deliberately no `2xs` (24px) twin. `Button`'s exists because
      // 46 call sites improvised the chip rung, but 24px cannot hold 16px text
      // on the very phones the rule above is protecting, and no field in the
      // app has asked for one.
      size: {
        xs: 'h-8 px-2 py-1',
        sm: 'h-9 px-3 py-1',
        default: 'h-10 px-3 py-2',
        lg: 'h-11 px-3 py-2',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface InputProps
  // `size` is omitted because the native attribute of that name is a NUMBER of
  // characters, and keeping both would make `size="sm"` a type error at every
  // call site. Nothing in the app used the native one; a field that wants a
  // character width states it as `className="w-…"` like the rest of the layout.
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => (
    <input type={type} ref={ref} className={cn(inputVariants({ size, className }))} {...props} />
  ),
);
Input.displayName = 'Input';

export { inputVariants };
