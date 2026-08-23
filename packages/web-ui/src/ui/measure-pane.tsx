'use client';

import { useRef, useState } from 'react';
import { GripVerticalIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import useMediaQuery from '../hooks/use-media-query';

/** Tailwind's `md`, the same breakpoint `MasterDetail` uses. */
const DESKTOP = '(min-width: 768px)';

/** Arrow-key resize step. */
const KEY_STEP = 32;

function px(value: string, fallback: number): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A reading measure the reader sets, CENTERED in whatever room the route has.
 *
 * For reading text — a page, a note, a thread. Such content wants two things
 * that one drag cannot give: a line length the reader controls, and a seat in
 * the middle of the display area rather than against its left edge. The first
 * cut of this component solved only the first — content panel plus an empty
 * spacer on the right — so the page always tucked LEFT, and going wider was
 * the only way to reach the middle of a wide window: a wall of text.
 *
 * Now the measure is a `max-width` on a centered column. The handle on the
 * right edge sets the width; the margins either side split the slack equally
 * and grow together as the display area does — focus mode, a collapsed rail, a
 * bigger window all re-CENTER the page without re-flowing the paragraph the
 * reader is in the middle of. When the room shrinks below the chosen measure
 * the column simply fills what is there, margins gone, and the handle still
 * narrows it from that edge.
 *
 * The drag moves the width at 2× the pointer, because both edges give way at
 * once — which is exactly what keeps the handle under the pointer. Double-click
 * resets to the default. The width is remembered per `id`.
 *
 * Children own their scrolling (`h-full` column with its own scroller), which
 * is what keeps the handle pinned to the viewport instead of scrolling away
 * with the page.
 *
 * Below `md` there is no handle and no margin: a phone has no slack to split.
 */
export function MeasurePane({
  id,
  children,
  defaultSize = '900px',
  minSize = '480px',
  className,
}: {
  /** Persistence key. Unique per route — two routes sharing one share a width. */
  id: string;
  children: React.ReactNode;
  /** Opening measure. Wide enough for the content's own furniture (an outline
   *  rail, a gutter) on top of the prose. */
  defaultSize?: string;
  minSize?: string;
  className?: string;
}) {
  const isDesktop = useMediaQuery(DESKTOP);
  // `:width` keeps the key clear of the panel-layout JSON the old
  // panel-plus-spacer build of this component saved under `measure-pane:<id>`.
  const key = `measure-pane:${id}:width`;
  const fallback = px(defaultSize, 900);
  const min = px(minSize, 480);

  // Reading localStorage in the initializer is hydration-safe here: the first
  // render (server and client both) takes the `!isDesktop` return below, which
  // does not depend on `width` — the measure itself only mounts after
  // `useMediaQuery` resolves in an effect.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return fallback;
    const saved = Number.parseFloat(window.localStorage.getItem(key) ?? '');
    return Number.isFinite(saved) && saved >= min ? saved : fallback;
  });
  const [dragging, setDragging] = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const clamp = (w: number) => {
    const max = outerRef.current?.clientWidth ?? Number.POSITIVE_INFINITY;
    return Math.min(Math.max(w, min), max);
  };
  const save = (w: number) => window.localStorage.setItem(key, String(Math.round(w)));
  const apply = (w: number) => {
    const next = clamp(w);
    setWidth(next);
    save(next);
    return next;
  };

  if (!isDesktop) return <div className={cn('h-full min-h-0', className)}>{children}</div>;

  return (
    <div
      ref={outerRef}
      className={cn('relative h-full min-h-0 w-full', dragging && 'select-none', className)}
      style={dragging ? { cursor: 'col-resize' } : undefined}
    >
      <div
        ref={innerRef}
        className="relative mx-auto h-full min-h-0 w-full"
        style={{ maxWidth: `${width}px` }}
      >
        {children}
        {/* The handle. The 1px rule sits ON the column's right edge; the grip
            chip is drawn at rest, per the style guide's "every draggable edge
            shows a grip". The full-height hitbox straddles the rule — 4px
            inside, 12px in the MARGIN — enough to catch a press on the line
            itself without burying the content's own scrollbar underneath. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Page width"
          aria-valuemin={min}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          className="group absolute inset-y-0 left-full z-10 -ml-1 w-4 cursor-col-resize outline-none"
          onPointerDown={(e) => {
            // The rendered width, not the stored one: a stored width wider
            // than the room starts the drag from the edge under the pointer.
            const startWidth = innerRef.current?.offsetWidth ?? width;
            drag.current = { pointerId: e.pointerId, startX: e.clientX, startWidth };
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (!drag.current || drag.current.pointerId !== e.pointerId) return;
            // 2× the pointer: centered, both edges give way together, which is
            // what keeps the dragged edge tracking the pointer itself.
            setWidth(clamp(drag.current.startWidth + 2 * (e.clientX - drag.current.startX)));
          }}
          onPointerUp={(e) => {
            if (!drag.current || drag.current.pointerId !== e.pointerId) return;
            // Recompute, don't read the DOM: the render from the final
            // pointermove may not have painted yet, and `offsetWidth` would
            // save the width the drag STARTED at.
            const final = clamp(drag.current.startWidth + 2 * (e.clientX - drag.current.startX));
            drag.current = null;
            setDragging(false);
            setWidth(final);
            save(final);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          // Reset. `dblclick` arrives AFTER the second press's pointerup
          // (down, up, down, up, dblclick), so the zero-move drag that press
          // started has already re-saved the old width by the time this
          // clears it — the reset always lands last.
          onDoubleClick={() => {
            setWidth(fallback);
            window.localStorage.removeItem(key);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') apply(width + KEY_STEP);
            else if (e.key === 'ArrowLeft') apply(width - KEY_STEP);
            else if (e.key === 'Home') apply(min);
            else if (e.key === 'End') apply(Number.POSITIVE_INFINITY);
            else return;
            e.preventDefault();
          }}
        >
          <div
            className={cn(
              'absolute inset-y-0 left-1 w-px bg-border',
              dragging && 'bg-ring',
              'group-hover:bg-ring/50 group-focus-visible:bg-ring',
            )}
          />
          <div className="absolute left-1 top-1/2 z-10 flex h-4 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xs border bg-border">
            <GripVerticalIcon className="size-2.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
