import * as React from 'react';
import { cn } from '../lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      // `aria-invalid:` paints the control itself on a failed validation. The
      // attribute is what a screen reader already reads, so styling off it
      // keeps the two in step: there is no way to show the red border without
      // also announcing the field as invalid.
      //
      // `text-base md:text-sm`, matching `Textarea`: iOS Safari zooms the whole
      // page in when a focused field's text is under 16px, and it does not zoom
      // back out — every tap on a form left the user pinching. 16px on small
      // screens, the app's `text-sm` from `md` up.
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive md:text-sm',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
