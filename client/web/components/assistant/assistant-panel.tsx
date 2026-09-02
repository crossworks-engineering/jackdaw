'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@mantle/web-ui/lib/utils';
import { RailHandle } from '@mantle/web-ui/ui/rail-handle';
import { AssistantThreadClient } from '@/app/(app)/assistant/assistant-thread-client';
import { useAssistantDock } from './assistant-dock';
import { ASSISTANT_W_MAX, ASSISTANT_W_MIN } from '@/lib/nav-width';

/**
 * The full assistant, in one of two shapes:
 *
 *  - **Overlay** (default): fills the same inset box as the shell's `<main>`
 *    (below the header, between the nav rail and the live column), so it reads
 *    like any other screen rather than a floating window — yet it lives above
 *    every route, so it's available everywhere and minimises to the bubble.
 *
 *  - **Docked column** (any screen, lg+): the panel docks as a right-hand
 *    column between the content and the activity rail, and `<main>` shrinks
 *    beside it (the shell publishes `--assistant-w`) — so the screen stays
 *    visible and interactive while you chat. On editor surfaces that means
 *    gutter marks, live edits, and review highlights are seen as they happen,
 *    like the old dedicated assist panels. Below lg it falls back to the
 *    overlay. The header toggle flips column ⇄ full display, persisted. The
 *    column is DRAGGABLE by the handle on its inner edge — the same
 *    `RailHandle` the nav and activity rails use, so one affordance keeps
 *    meaning one thing across the frame.
 *
 * It mounts in the background on page load (hidden via display:none until
 * `open`), so the thread warms immediately, the composer exists from the start
 * (a marker selection always has somewhere to land), and opening is instant.
 * It then stays mounted, so the transcript, scroll position, composer draft,
 * and any live turn stream survive a minimise/restore without a re-fetch.
 * `Esc` minimises.
 */
export function AssistantPanel() {
  const { panel, activeAgentSlug, minimize, docked, dockWidth, setDockWidth } = useAssistantDock();
  // The handle measures the new width from THIS element's right edge. The
  // column is inset by the activity rail, so the viewport-edge maths every
  // shell rail uses would hand it a width one whole rail too big.
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc minimises while open.
  useEffect(() => {
    if (panel !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        minimize();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, minimize]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed inset-x-0 bottom-0 top-[var(--top-bar-h)] z-20 bg-background md:left-[var(--nav-w)] lg:right-[var(--activity-w)]',
        // Docked: a right column beside the visible editor (lg+ only — below lg
        // the overlay geometry above still applies).
        docked && 'lg:left-auto lg:w-[var(--assistant-w)] lg:border-l lg:border-border',
        panel !== 'open' && 'hidden',
      )}
      aria-hidden={panel !== 'open'}
    >
      {/* Only the docked column has a width to drag: the overlay is sized by the
          shell's own offsets, and below lg the column geometry does not apply,
          so the handle is hidden there rather than dragging a width nothing
          reads. */}
      {docked && (
        <RailHandle
          label="Resize assistant"
          side="left"
          value={dockWidth}
          min={ASSISTANT_W_MIN}
          max={ASSISTANT_W_MAX}
          onChange={setDockWidth}
          boundsRef={panelRef}
          className="hidden lg:block"
        />
      )}
      <AssistantThreadClient slugHint={activeAgentSlug} />
    </div>
  );
}
