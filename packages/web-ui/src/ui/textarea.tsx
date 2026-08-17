import * as React from 'react';

import { cn } from '../lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Matches `Input` field-for-field so the two read as one control on
          // a card: same `bg-background`, no shadow, same `ring-2` + offset.
          // They diverged before, and it showed the moment a form sat on a
          // card surface (the textarea alone looked lighter, and lifted).
          //
          // Two deliberate differences, both textarea-only:
          //  - `min-h-[60px]` instead of `Input`'s fixed `h-10`; it grows.
          //  - `scrollbar-thin`, because this is the one field that scrolls
          //    and nothing sets a thin bar globally (html/body are `auto`).
          //
          // `text-base md:text-sm` is the iOS zoom guard, and `Input` carries
          // it too now — keep the two in step if either changes.
          'flex min-h-[60px] w-full scrollbar-thin rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
