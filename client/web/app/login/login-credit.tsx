/**
 * The small Jackdaw mark at the foot of the sign-in screen.
 *
 * Once a brain wears its OWN branding up top, the product's mark has nowhere
 * left to sit — so it moves here: quiet, small, and out of the way of the thing
 * the owner chose to put in the hero slot. The brand says whose brain this is;
 * this says what it is built on. Both are true and they want different weights.
 *
 * Named `LoginCredit` rather than `JackdawCredit` to match the folder — every
 * component here is `Login*` in a `login-*.tsx`, and the Jackdaw-specific piece
 * stays an internal detail, exactly as `login-mark.tsx` keeps `JackdawLockup`
 * private to itself.
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
 * wordmark, 338×96), which is also the shape that reads well in a footer. Two
 * imgs swapped by the `dark:` variant, a CSS swap, so flipping the theme never
 * waits on a fetch.
 *
 * `h-12` puts it at 48px tall, about a quarter of the hero. The source PNGs are
 * 96px tall, so 48px is exactly 2x and stays sharp on retina. The intrinsic
 * `width`/`height` are declared so the footer reserves its box and the form
 * above never shifts when the image decodes.
 */
export function LoginCredit() {
  return (
    <footer className="flex justify-center pt-8">
      {/* Softened so it stays a credit at this size: the mark is big enough to
          read comfortably, and opacity is what keeps it from competing with the
          owner's hero. Fixed opacity, no hover change: there is nothing to
          click here, and a mark that reacts to the pointer claims to be a
          control. */}
      <span className="opacity-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jackdaw-row-light.png"
          alt="Jackdaw"
          width={344}
          height={96}
          className="h-12 w-auto dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/jackdaw-row-dark.png"
          alt="Jackdaw"
          width={338}
          height={96}
          className="hidden h-12 w-auto dark:block"
        />
      </span>
    </footer>
  );
}
