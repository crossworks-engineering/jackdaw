'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from './color-theme-provider';
import { cn } from './lib/utils';
import {
  decodeNeatSpec,
  encodeNeatSpec,
  type NeatBackgroundSpec,
} from '@mantle/share-ui/neat-background';
import { mountNeat, type NeatMountHandle } from '@mantle/share-ui/neat-mount';

/**
 * The live Neat gradient, filling its positioned parent. One component serves
 * both the settings preview and the real surfaces — login screen, content
 * area, team workspace — so the preview can never lie about what a spec looks
 * like.
 *
 * A thin React shell over the shared `mountNeat` (@mantle/share-ui): the
 * WebGL specifics — the dynamic import, token reading, the fp32 seed clamp,
 * reduced-motion — live THERE, once, shared with the /s reader's vanilla
 * runtime in the mantle repo. This component owns only what React owns:
 *
 *  - WHEN to (re)mount: the gradient is recreated, not mutated, when the spec
 *    or theme changes — destroy + construct is cheap at this frequency and
 *    one code path stays honest.
 *  - TIMING: the token read is deferred to a frame ON PURPOSE. The in-app
 *    mode toggle updates React state first and next-themes applies the
 *    `.dark` class in a PARENT effect — which runs after this child effect.
 *    Mounting synchronously here read the OUTGOING theme's tokens, so a mode
 *    switch didn't repaint until a reload. An rAF callback runs after the
 *    whole commit (class applied, styles resolved), whichever order the
 *    providers fire in.
 *  - CANCELLATION: mountNeat resolves after an await, so an unmounted or
 *    superseded effect destroys the handle it receives instead of keeping it.
 */

/** Removes the library's watermark on deployed domains — per-domain licence,
 *  see https://neat.firecms.co. Unset is fine on localhost (always unlocked). */
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
    let gradient: NeatMountHandle | null = null;
    const raf = requestAnimationFrame(() => {
      void mountNeat(canvas, decoded, mode, {
        resolution,
        ...(LICENSE_KEY ? { licenseKey: LICENSE_KEY } : {}),
      }).then((handle) => {
        if (disposed) {
          handle?.destroy();
          return;
        }
        gradient = handle;
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
