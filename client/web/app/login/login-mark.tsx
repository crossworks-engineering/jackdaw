'use client';

import { cn } from '@mantle/web-ui/lib/utils';
import { BrandLogo } from '@/components/layout/rail/brand-logo';
import type { LoginBrand } from '@/lib/brand';

/**
 * What the sign-in screen calls itself.
 *
 * Three rungs, resolved in `lib/brand.ts` and rendered here:
 *
 *   1. an uploaded logo,
 *   2. else the brain's site name, in the owner's chosen logo face,
 *   3. else the Jackdaw lockup — unchanged, and still the last word.
 *
 * The lockup's own note called this "the only surface that gets the full mark;
 * everywhere in-app wears the row lockup or the wordmark alone, so the bird
 * stays an event rather than chrome." Overriding that is deliberate, and only
 * ever when the owner has said what belongs there instead. A brain that has
 * said nothing looks exactly as it did.
 *
 * ── No flash ───────────────────────────────────────────────────────────────
 * The branding is DECIDED on the server — `page.tsx` resolves it and hands the
 * answer down as props — so it is already in the HTML that leaves the box. The
 * obvious alternative, fetching on mount, shows the Jackdaw bird for a beat and
 * then swaps it for the owner's brand on every single load: it looks like a bug,
 * and it is worst on the slow connections that most need a stable screen.
 *
 * ⚠ This file is `'use client'` even so, and that does NOT reintroduce the
 * flash — a client component still renders to HTML on the server; only its
 * event handlers wait for hydration, and this has none. The directive is here
 * because `BrandLogo` is itself a client component and takes `renderWordmark`,
 * a FUNCTION. Functions cannot cross the server→client boundary, so a server
 * component calling it fails the render outright ("Functions cannot be passed
 * directly to Client Components"). Keeping the data server-resolved and the
 * markup client-rendered gets both halves.
 *
 * ── The three-way cascade is `BrandLogo`'s, not a copy of it ───────────────
 * A dark-only upload is a supported state: the logo route 404s on the missing
 * variant on purpose and leaves the fallback to the client. `BrandLogo` already
 * encodes that (and the rail's copy of the same logic once got it wrong, which
 * is why it is shared). All this adds is what to fall back TO — the name when
 * there is one, the lockup when there is not.
 */
export function LoginMark({ brand, srcBase }: { brand: LoginBrand; srcBase?: string }) {
  return (
    <div className="space-y-2">
      {/* Fixed slot. The lockup is 180px tall and the alternatives are not, so
          without a floor here the form jumps up the screen the moment a brain
          is branded — and a short wordmark would sit in a different place from
          the bird it replaced. `max-h` on the img keeps a tall badge and a wide
          banner in the same box. */}
      <h1 className="flex min-h-[180px] items-center justify-center">
        <BrandLogo
          name={brand.name}
          logoVersion={brand.logoVersion}
          logoDarkVersion={brand.logoDarkVersion}
          // The brain's origin, resolved on the server and handed down. Without
          // it the img src comes out relative, which is wrong on any split-origin
          // install and in the desktop shell — see the note in `brand-logo.tsx`.
          srcBase={srcBase}
          imgClassName="max-h-[180px] w-auto max-w-full object-contain"
          renderWordmark={(visibility) =>
            brand.named ? (
              <span
                // The chosen logo face at the chosen size — see
                // `.wordmark-login` in globals.css for why this is not
                // `wordmark text-5xl`.
                //
                // `break-words` because a site name may be 40 characters: it
                // wraps inside the slot rather than running off the card.
                className={cn('wordmark-login break-words px-2 text-center', visibility)}
              >
                {brand.name}
              </span>
            ) : (
              <JackdawLockup className={visibility} />
            )
          }
        />
      </h1>
      {brand.peerName && (
        // Which BRAIN this is, under whatever it calls itself — the reason two
        // tabs on two boxes can be told apart at a glance.
        <p className="peer-name truncate text-center text-muted-foreground" title={brand.peerName}>
          {brand.peerName}
        </p>
      )}
    </div>
  );
}

/**
 * The product's own mark: the STACKED lockup, badge over wordmark. Two imgs
 * swapped by the `dark:` variant — a CSS swap, so flipping the theme never
 * waits on a fetch.
 *
 * `visibility` arrives set when the lockup is standing in for a MISSING light
 * logo (a dark-only upload), and it must be forwarded or both would show at
 * once in dark mode. It rides an outer `contents` span so it applies to the
 * pair rather than being written into each `dark:` class.
 */
function JackdawLockup({ className }: { className?: string }) {
  return (
    <span className={cn('contents', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/jackdaw-lockup-light.png"
        alt="Jackdaw"
        width={145}
        height={180}
        className="h-[180px] w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/jackdaw-lockup-dark.png"
        alt="Jackdaw"
        width={144}
        height={180}
        className="hidden h-[180px] w-auto dark:block"
      />
    </span>
  );
}
