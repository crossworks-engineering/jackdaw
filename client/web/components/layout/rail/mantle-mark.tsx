import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The Mantle brand art: the brain this interface talks to. Jackdaw's own marks
 * live in `jackdaw-mark.tsx`; these sit beside them wherever both halves of an
 * install are named (the dashboard's Build card, the rail's version footer,
 * the sign-in credit).
 *
 * The files are copies of `brand/mantle-logo-icon.svg` and
 * `brand/mantle-logo-full.svg` from the mantle repo, the source of truth. When
 * the mark changes there, copy them into `public/brand/` again under these
 * names.
 *
 * ONE file per mark, not a light/dark pair like Jackdaw's: the Mantle art is
 * drawn in its own warm colours, with no ink that has to flip for the theme,
 * so the same SVG reads on both grounds.
 */

/** The badge alone, square. Decorative: always sits beside a text label. */
export function MantleBadge({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mantle-badge.svg"
      alt=""
      aria-hidden
      width={32}
      height={32}
      className={cn('object-contain', className)}
    />
  );
}

/** Badge and name on one line. Supply the height (e.g. `h-10`). */
export function MantleRow({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/mantle-row.svg"
      alt="Mantle"
      width={168}
      height={40}
      className={cn('w-auto object-contain', className)}
    />
  );
}
