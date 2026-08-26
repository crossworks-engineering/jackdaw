import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  // `shrink-0` and `select-none` match upstream: a button in a tight flex row
  // should keep its size rather than be squashed below its label, and its text
  // is a control, not prose to drag-select.
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary-ink underline-offset-4 hover:underline',
        // Semantic approve/deny aliases — used by sender curation buttons.
        // Theme-aware: approve uses the primary action colour, deny the
        // destructive colour, so they recolour with the active theme instead
        // of forcing green/red.
        approve: 'bg-primary text-primary-foreground hover:bg-primary/90',
        deny: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      // Every labelled size has a square `icon-*` twin at the SAME height, so
      // an icon button can sit in a row with a text button and line up. That
      // pairing was missing before, and call sites improvised: 23 of them used
      // `ghost`+`sm` to hold a lone icon (a 40x36 rectangle), and 5 hand-set
      // `size-7`/`size-9` on the Button. One screen rendered buttons at four
      // different heights. Reach for the twin instead of a `size-*` override.
      size: {
        xs: 'h-8 px-2 text-xs',
        sm: 'h-9 px-3',
        default: 'h-10 px-4 py-2',
        lg: 'h-11 px-8',
        'icon-xs': 'size-8',
        'icon-sm': 'size-9',
        icon: 'size-10',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
