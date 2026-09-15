'use client';

import * as React from 'react';

const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Make the selection follow the arrow keys in a `role="radio"` group — which
 * the WAI-ARIA radio pattern and native radios both do, and which Radix either
 * loses a race over or never attempts.
 *
 * `react-roving-focus` moves the focus from a `setTimeout`, not synchronously —
 * measured at 50–60 ms after keydown on /settings/appearance, and up to 150 ms
 * while a previous click was still re-rendering. What each primitive does with
 * that differs:
 *
 * - `RadioGroup` selects the newly focused item from `onFocus`, but only while
 *   an "arrow key is down" flag is set, and it clears that flag from a
 *   document-level `keyup`. So the selection follows focus only if the key is
 *   still held when the deferred focus lands. A quick tap loses; an automated
 *   press (Playwright, CDP) sends keyup 0 ms after keydown and loses every
 *   time, which is why no e2e test could have caught it.
 * - `ToggleGroup type="single"` renders `role="radiogroup"` and `role="radio"`
 *   items with `aria-checked`, and has no select-on-focus at all. Arrow keys
 *   move focus and never change the selection.
 *
 * Re-assert the selection rather than re-implement the navigation. Wire these
 * handlers to the group ROOT, so `onKeyDown` runs after the item's own — same
 * synthetic dispatch, bubbling — and the timer it queues is therefore queued
 * after the one roving focus queued, and runs after it. By then focus has
 * landed, and selecting whatever it landed on is the whole of the fix.
 *
 * Still needed? Look for `isArrowKeyPressedRef` in @radix-ui/react-radio-group,
 * and for a focus handler in @radix-ui/react-toggle-group that does not exist.
 * Both unchanged as of radio-group 1.4.7 / toggle-group 1.1.19.
 *
 * @param enabled pass `false` for a group that is NOT radio-like — a
 * `ToggleGroup type="multiple"` is a toolbar of independent toggles, where
 * arrowing onto a button must never press it.
 */
export function useSelectionFollowsFocus(enabled = true) {
  // The radio that Radix — or a real mouse — already clicked during this key
  // press. Without it a consumer whose `onValueChange` settles asynchronously
  // would take a second one for the same choice.
  const alreadyClicked = React.useRef<Element | null>(null);

  return React.useMemo(
    () => ({
      onClickCapture(event: React.MouseEvent<HTMLElement>) {
        if (!enabled) return;
        // Capture, because `RadioTrigger`'s own onClick stops propagation to
        // keep the hidden form input from double-firing — nothing bubbling
        // ever sees it.
        alreadyClicked.current =
          event.target instanceof Element ? event.target.closest('[role="radio"]') : null;
      },

      onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
        if (!enabled) return;
        // `defaultPrevented` is roving focus saying it took the key — which
        // also means orientation, direction, `loop` and disabled items have
        // all been honoured already, and a focus move is in flight.
        if (!ARROW_KEYS.includes(event.key) || !event.defaultPrevented) return;
        const root = event.currentTarget;
        alreadyClicked.current = null;
        setTimeout(() => {
          const item =
            document.activeElement instanceof Element
              ? document.activeElement.closest<HTMLElement>('[role="radio"]')
              : null;
          if (!item || !root.contains(item) || item === alreadyClicked.current) return;
          // Never click the item that is already selected. It is a no-op for a
          // radio, but a single-select ToggleGroup treats a press on its own
          // checked item as a DESELECT, and would empty the group.
          if (item.getAttribute('aria-checked') === 'true') return;
          item.click();
        });
      },
    }),
    [enabled],
  );
}
