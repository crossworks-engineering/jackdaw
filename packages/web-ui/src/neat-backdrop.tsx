'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from './color-theme-provider';
import { cn } from './lib/utils';
import {
  decodeNeatSpec,
  encodeNeatSpec,
  neatConfigFromSpec,
  type NeatBackgroundSpec,
} from './neat-background';

/**
 * The live Neat gradient, filling its positioned parent. One component serves
 * both the settings preview and (later) the real surfaces — login screen,
 * content area — so the preview can never lie about what a spec looks like.
 *
 * WebGL specifics, all deliberate:
 *  - `@firecms/neat` is raw WebGL (~80KB, no three.js), loaded via dynamic
 *    import inside the effect — first paint of every page stays clean, and the
 *    chunk is only fetched on surfaces that actually show a gradient.
 *  - Colours are read off the document per (colour theme × mode), the
 *    theme-ramp.ts pattern: shaders take literals, not `var()`.
 *  - The gradient is recreated, not mutated, when the spec or theme changes —
 *    destroy + construct is cheap at this frequency and one code path stays
 *    honest.
 *  - `prefers-reduced-motion` freezes the animation (speed 0); the wash still
 *    paints.
 */

/** Removes the library's watermark on deployed domains — €12/domain, see
 *  https://neat.firecms.co. Unset is fine on localhost (always unlocked). */
const LICENSE_KEY = process.env.NEXT_PUBLIC_NEAT_LICENSE_KEY;

export function NeatBackdrop({
  spec,
  className,
  resolution = 1,
}: {
  spec: NeatBackgroundSpec;
  className?: string;
  /** Render scale, 0..1 — previews can afford less than full. */
  resolution?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();
  const { colorTheme } = useColorTheme();
  // The effect keys on the canonical encoding so an equal spec in a new object
  // never tears the WebGL context down just to build the same one back up.
  const specKey = encodeNeatSpec(spec);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const decoded = decodeNeatSpec(specKey);
    if (!canvas || !decoded) return;

    const mode = resolvedTheme === 'dark' ? 'dark' : 'light';

    let disposed = false;
    let raf = 0;
    let gradient: { destroy: () => void } | null = null;
    void import('@firecms/neat').then(({ NeatGradient }) => {
      if (disposed) return;
      // Token read deferred to a frame ON PURPOSE. The in-app mode toggle
      // updates React state first and next-themes applies the `.dark` class in
      // a PARENT effect — which runs after this child effect. Reading
      // getComputedStyle here directly rebuilt the gradient from the OUTGOING
      // theme's tokens, so a mode switch didn't repaint until a reload. An rAF
      // callback runs after the whole commit (class applied, styles resolved),
      // whichever order the providers fire in.
      raf = requestAnimationFrame(() => {
        if (disposed) return;
        const cs = getComputedStyle(document.documentElement);
        const read = (name: string) => cs.getPropertyValue(name).trim();
        const tokens = {
          background: read('--background'),
          primary: read('--primary'),
          accent: read('--accent'),
          secondary: read('--secondary'),
        };
        // No resolvable theme (a test DOM, a broken stylesheet) — paint nothing
        // rather than a wrong guess; the surface underneath is already themed.
        if (!tokens.background || !tokens.primary) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const config = neatConfigFromSpec(decoded, tokens, mode);
        try {
          gradient = new NeatGradient({
            ...config,
            ref: canvas,
            // Neat's `seed` is NOT a randomness seed — it is the animation
            // clock's starting value (u_time), normally elapsed-seconds-in-
            // the-hour (≤3600). Our raw 32-bit seed (~3e9) exceeds fp32
            // precision on the GPU: the shader's small spatial/time offsets
            // collapse against it and the gradient renders as ONE FLAT
            // COLOUR with no motion. Mod into the library's own clock range;
            // the full seed still drives the parameter PRNG.
            seed: decoded.seed % 3600,
            resolution,
            speed: reduced ? 0 : config.speed,
            ...(LICENSE_KEY ? { licenseKey: LICENSE_KEY } : {}),
          });
        } catch {
          // WebGL unavailable (headless browser, exhausted contexts) — the
          // plain themed surface below is the designed fallback, not an error.
        }
      });
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gradient?.destroy();
    };
  }, [specKey, resolvedTheme, colorTheme, resolution]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    />
  );
}
