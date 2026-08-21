import { cn } from '@mantle/web-ui/lib/utils';

/**
 * The small Jackdaw mark at the foot of the sign-in screen.
 *
 * Once a brain wears its OWN branding up top, the product's mark has nowhere
 * left to sit — so it moves here: quiet, small, and out of the way of the thing
 * the owner chose to put in the hero slot. The brand says whose brain this is;
 * this says what it is built on. Both are true and they want different weights.
 *
 * ── Why it is not always shown ─────────────────────────────────────────────
 * On an UNBRANDED brain the hero slot is already the Jackdaw lockup, and the
 * same mark twice on one short screen reads as a bug rather than a credit. So
 * `page.tsx` renders this only when the owner's branding won the hero — see the
 * `kind !== 'jackdaw'` test there.
 *
 * One acknowledged edge: a brain with ONLY a dark logo uploaded and no site
 * name falls back to the lockup in LIGHT mode (that fallback is `BrandLogo`'s
 * and is correct), so that one theme of that one configuration shows the mark
 * twice. It cannot be resolved here — the light/dark swap is pure CSS with no
 * render-time answer — and the fix is for that owner to upload a light variant
 * or name the brain, which the screen is asking for anyway.
 *
 * ── The ROW lockup, not the stacked one ────────────────────────────────────
 * The house rule is that the stacked lockup is the hero and "everywhere in-app
 * wears the row lockup or the wordmark alone, so the bird stays an event rather
 * than chrome". A footer credit is chrome, so it takes the row (bird beside
 * wordmark, 338×96) — which is also the shape that stays legible when it is
 * this small. Two imgs swapped by the `dark:` variant, a CSS swap, so flipping
 * the theme never waits on a fetch.
 *
 * `h-6` puts it at 24px tall — about a seventh of the hero — and the intrinsic
 * `width`/`height` are declared so the footer reserves its box and the form
 * above never shifts when the image decodes.
 */
export function JackdawCredit({ className }: { className?: string }) {
  return (
    <footer className={cn('flex justify-center pt-8', className)}>
      {/* Softened rather than shrunk further: below ~24px the wordmark stops
          being readable, so the way to make a credit recede is opacity, not
          size. It lifts on hover only to confirm it is a real mark and not an
          artefact — there is nothing to click. */}
      <span className="opacity-50 transition-opacity hover:opacity-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jackdaw-row-light.png"
          alt="Jackdaw"
          width={344}
          height={96}
          className="h-6 w-auto dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jackdaw-row-dark.png"
          alt="Jackdaw"
          width={338}
          height={96}
          className="hidden h-6 w-auto dark:block"
        />
      </span>
    </footer>
  );
}
