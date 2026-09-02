'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@mantle/web-ui/lib/utils';
import { RailHandle } from '@mantle/web-ui/ui/rail-handle';
import { AssistantThreadClient } from '@/app/(app)/assistant/assistant-thread-client';
import { useAssistantDock } from './assistant-dock';
import { ASSISTANT_W_MAX, ASSISTANT_W_MIN } from '@/lib/nav-width';

/** Where a window that has never been placed opens: inset from the bottom-right
 *  of the viewport, clear of the activity rail, at a size that fits a laptop. */
function firstPlacement() {
  const w = Math.min(560, Math.max(360, window.innerWidth - 160));
  const h = Math.min(640, Math.max(320, window.innerHeight - 160));
  return { w, h, x: window.innerWidth - w - 96, y: window.innerHeight - h - 64 };
}

/**
 * The full assistant, in one of three shapes — picked by the switcher in its
 * own header, and remembered, so recalling the assistant brings back the shape
 * and the place you left it in:
 *
 *  - **Docked column** (default, lg+): a right-hand column between the content
 *    and the activity rail, with `<main>` shrinking beside it (the shell
 *    publishes `--assistant-w`) — so the screen stays visible and interactive
 *    while you chat. On editor surfaces that means gutter marks, live edits and
 *    review highlights are seen as they happen. Draggable by the `RailHandle`
 *    on its inner edge, the same grip the nav and activity rails use.
 *
 *  - **Window** (lg+): a plain floating window. Move it by its header, size it
 *    by the corner grip. Nothing behind it is covered permanently and nothing
 *    reflows around it, which is the point — it is for reading a reply beside
 *    something the column would have pushed out of the way.
 *
 *  - **Overlay**: fills the same inset box as the shell's `<main>`, so it reads
 *    like any other screen rather than a floating window. This is also the
 *    fallback below lg, where neither a column nor a window has room: the two
 *    lg-only shapes simply do not apply and the base geometry stands.
 *
 * It mounts in the background on page load (hidden via display:none until
 * `open`), so the thread warms immediately, the composer exists from the start
 * (a marker selection always has somewhere to land), and opening is instant.
 * It then stays mounted, so the transcript, scroll position, composer draft,
 * and any live turn stream survive a minimise/restore — or a change of shape —
 * without a re-fetch. `Esc` minimises.
 */
export function AssistantPanel() {
  const {
    panel,
    activeAgentSlug,
    minimize,
    display,
    dockWidth,
    setDockWidth,
    popout,
    setPopout,
    startPopoutResize,
  } = useAssistantDock();
  // The column handle measures the new width from THIS element's right edge.
  // The column is inset by the activity rail, so the viewport-edge maths every
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

  // A window that has never been placed needs a first box, and that needs a
  // viewport — so it is resolved on the first switch to the window, not while
  // rendering (where there is no window on the server).
  useEffect(() => {
    if (display === 'popout' && !popout) setPopout(firstPlacement());
  }, [display, popout, setPopout]);

  const isWindow = display === 'popout' && popout !== null;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed inset-x-0 bottom-0 top-[var(--top-bar-h)] z-20 bg-background md:left-[var(--nav-w)] lg:right-[var(--activity-w)]',
        // Column: a right column beside the visible editor (lg+ only — below lg
        // the overlay geometry above still applies).
        display === 'docked' &&
          'lg:left-auto lg:w-[var(--assistant-w)] lg:border-l lg:border-border',
        // Window: the box comes in as CSS variables rather than inline
        // left/top/width/height, so it can be scoped to `lg:` like everything
        // else here. An inline style would beat the media query and drag the
        // window geometry down onto phones, where there is no room for it.
        isWindow &&
          'lg:inset-auto lg:left-[var(--popout-x)] lg:top-[var(--popout-y)] lg:h-[var(--popout-h)] lg:w-[var(--popout-w)] lg:z-30 lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:shadow-lg',
        panel !== 'open' && 'hidden',
      )}
      style={
        isWindow
          ? ({
              '--popout-x': `${popout.x}px`,
              '--popout-y': `${popout.y}px`,
              '--popout-w': `${popout.w}px`,
              '--popout-h': `${popout.h}px`,
            } as React.CSSProperties)
          : undefined
      }
      aria-hidden={panel !== 'open'}
    >
      {/* Only the column has a width to drag: the overlay is sized by the
          shell's own offsets, and below lg the column geometry does not apply,
          so the handle is hidden there rather than dragging a width nothing
          reads. */}
      {display === 'docked' && (
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

      {/* The window's size grip. Bottom-right, the corner every desktop window
          is sized from, and drawn at rest like every other draggable edge in
          the frame (style guide §8) rather than appearing on hover. */}
      {isWindow && (
        <div
          role="separator"
          aria-label="Resize assistant window"
          aria-orientation="horizontal"
          onPointerDown={startPopoutResize}
          className="absolute bottom-0 right-0 hidden size-4 cursor-nwse-resize touch-none items-end justify-end p-0.5 lg:flex"
        >
          <span aria-hidden className="size-2.5 rounded-xs border-b-2 border-r-2 border-border" />
        </div>
      )}
    </div>
  );
}
