'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * React Flow's `ColorMode` values, restated here so this package doesn't take a
 * dependency on `@xyflow/react` for a two-word union — only the app canvases
 * that render one need the library itself.
 */
export type FlowColorMode = 'light' | 'dark';

/**
 * The colour mode to hand a React Flow canvas, resolved from the app's own
 * theme.
 *
 * React Flow paints its Controls, MiniMap and Background dots from its own
 * palette and defaults to `colorMode="light"`, so a canvas left unconfigured
 * renders a bright white control block on a dark page. Its built-in `'system'`
 * doesn't fix that either: this app has an explicit light/dark toggle
 * (`theme-toggle.tsx`), so the OS preference and the user's choice disagree the
 * moment they override it. `resolvedTheme` is the value that follows the toggle.
 *
 * Returns `'light'` until mounted, on purpose. next-themes leaves
 * `resolvedTheme` undefined during SSR and the first client render, so the
 * first output has to match what the server rendered or hydration warns; the
 * real value lands on the next frame.
 */
export function useFlowColorMode(): FlowColorMode {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted && resolvedTheme === 'dark' ? 'dark' : 'light';
}
