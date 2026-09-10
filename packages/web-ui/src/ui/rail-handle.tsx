'use client';

import { GripVerticalIcon } from 'lucide-react';
import { useCallback, useRef } from 'react';

import { cn } from '../lib/utils';

/**
 * Drag handle for a FIXED rail (the nav, the activity column), as opposed to
 * `ResizableHandle`, which only works between flex panels of a
 * `ResizablePanelGroup`.
 *
 * The shell's rails are `position: fixed` and publish their width as a CSS
 * variable that six other surfaces position against (`<main>`, mail, the
 * assistant, the help rail, the fleet layout, the toast dock). Wrapping them in
 * a panel group would mean rebuilding that fixed layout, which is load-bearing.
 * So this writes a width instead, and every consumer follows the variable as it
 * always has.
 *
 * Keyboard-operable, because a drag-only control is unusable without a mouse:
 * arrows nudge by 8px, shift-arrows by 32px.
 *
 * It carries the SAME grip chip `ResizableHandle withHandle` draws, drawn at
 * rest rather than on hover (style guide §8: "every draggable edge shows a
 * grip, at rest, without hovering it"). One affordance means one thing, so the
 * chip is copied verbatim — `h-4 w-3`, bordered, `bg-border`, a `size-2.5`
 * `GripVerticalIcon` — and only its POSITIONING differs: `ResizableHandle`
 * centres its chip on a flex divider, and a fixed rail has no divider to sit
 * on, only an edge.
 */
export function RailHandle({
  value,
  onChange,
  min,
  max,
  side = 'right',
  label,
  className,
  onDraggingChange,
  boundsRef,
  liveVar,
}: {
  /** Current rail width in px. */
  value: number;
  /** Called with the new width in px, already clamped. */
  onChange: (px: number) => void;
  min: number;
  max: number;
  /** Which edge of the viewport the rail is pinned to. */
  side?: 'left' | 'right';
  label: string;
  className?: string;
  /** Fires on grab and release, so the rail can drop its width transition
   *  while dragging (with it on, the rail trails the pointer by a frame). */
  onDraggingChange?: (dragging: boolean) => void;
  /**
   * The element being resized, when its far edge is NOT the viewport edge.
   *
   * A shell rail is flush against the window, so the pointer's distance from
   * the viewport edge IS the new width. The assistant column is not: it is
   * inset by the activity rail, and measuring from the window would hand it a
   * width one whole rail too big. Given this, the width is measured from the
   * element's own rect instead, which needs no knowledge of what is outboard
   * of it. Omit it and the viewport-edge maths is used, unchanged.
   */
  boundsRef?: React.RefObject<HTMLElement | null>;
  /**
   * The CSS variable this rail's width is published as — `--nav-w`,
   * `--activity-w`, `--assistant-w`. Given it, a POINTER drag writes the
   * variable straight onto the shell root and calls `onChange` exactly once,
   * on release.
   *
   * Without it, `onChange` fires per pointermove, and for all three rails that
   * lands in shell state: every move re-rendered `ShellFrame` and reflowed
   * `<main>`, the assistant column and the live column together, a hundred
   * times a second. The popout window drag already worked this way (see
   * `dragPopout` in assistant-dock) — this is that pattern, not a new one.
   *
   * The variable is left in place on release rather than removed: React writes
   * the same value on the render `onChange` triggers, so removing it first
   * would show one frame of the pre-drag width.
   *
   * The KEYBOARD path is untouched. Arrow keys are one event per press, and a
   * render each is exactly right — it is also what keeps `value` (and so
   * `aria-valuenow`) honest between presses.
   */
  liveVar?: string;
}) {
  const dragging = useRef(false);
  // Resolved once per drag: the element carrying the shell's width variables.
  const host = useRef<HTMLElement | null>(null);
  // Where the pointer last put the rail. `value` cannot be read for this — it
  // is the last COMMITTED width, and during a live drag that is deliberately
  // stale.
  const live = useRef(value);
  const clamp = useCallback((px: number) => Math.min(max, Math.max(min, px)), [min, max]);
  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      // Before `onDraggingChange(false)`, deliberately: a consumer that
      // persists on release (the assistant dock does) reads the width this
      // call commits.
      if (host.current && liveVar) onChange(live.current);
      host.current = null;
      onDraggingChange?.(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [liveVar, onChange, onDraggingChange],
  );
  const widthAt = useCallback(
    (clientX: number) => {
      const rect = boundsRef?.current?.getBoundingClientRect();
      if (rect) return side === 'right' ? clientX - rect.left : rect.right - clientX;
      return side === 'right' ? clientX : window.innerWidth - clientX;
    },
    [boundsRef, side],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      // A 1px rule needs a bigger grab target than 1px; the padded hit area is
      // transparent and the visible line is the `after` element.
      className={cn(
        'group/rail-handle absolute inset-y-0 z-40 w-2 cursor-col-resize touch-none',
        'after:absolute after:inset-y-0 after:w-px after:bg-transparent after:transition-colors',
        'hover:after:bg-primary focus-visible:after:bg-primary focus-visible:outline-none',
        side === 'right' ? '-right-1 after:left-1/2' : '-left-1 after:right-1/2',
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        live.current = value;
        // `.mantle-shell` is the shell root, the one element every width
        // variable is set on. A rail rendered outside a shell (or with no
        // `liveVar`) finds nothing and keeps the per-move behaviour, which is
        // correct, just not free.
        host.current = liveVar ? e.currentTarget.closest<HTMLElement>('.mantle-shell') : null;
        onDraggingChange?.(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const px = clamp(widthAt(e.clientX));
        live.current = px;
        if (!host.current || !liveVar) {
          onChange(px);
          return;
        }
        host.current.style.setProperty(liveVar, `${px}px`);
        // React re-asserts this from `value` on the commit after release; until
        // then the DOM is the only place the live width exists, so the exposed
        // one has to be written here too.
        e.currentTarget.setAttribute('aria-valuenow', String(px));
      }}
      onPointerUp={endDrag}
      // A cancelled drag (a system gesture takes over, the pointer device goes
      // away) fires this and NOT pointerup. Before the live path it only left a
      // stale `dragging` flag; now it would also leave a width written on the
      // shell that React does not know about, so both ends run the same code.
      onPointerCancel={endDrag}
      data-slot="rail-handle"
      // Escape hatch for a rail dragged somewhere unusable.
      onDoubleClick={() => onChange(clamp(0))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 8;
        const grow = side === 'right' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = side === 'right' ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === grow) {
          e.preventDefault();
          onChange(clamp(value + step));
        } else if (e.key === shrink) {
          e.preventDefault();
          onChange(clamp(value - step));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(min);
        } else if (e.key === 'End') {
          e.preventDefault();
          onChange(max);
        }
      }}
    >
      {/* The grip, drawn at rest. Centred on the 1px rule (`after`), so it
          straddles the rail's edge exactly as `ResizableHandle`'s chip
          straddles its divider — half over the rail, half over the content.
          The rail is `fixed z-30` and owns a stacking context, so the outboard
          half paints above <main>, and nothing clips it because neither aside
          sets `overflow-hidden`. */}
      <div
        aria-hidden
        data-slot="rail-handle-grip"
        className={cn(
          'absolute top-1/2 z-10 flex h-4 w-3 -translate-y-1/2 items-center justify-center',
          'rounded-xs border bg-border',
          side === 'right' ? 'left-1/2 -translate-x-1/2' : 'right-1/2 translate-x-1/2',
        )}
      >
        <GripVerticalIcon className="size-2.5" />
      </div>
    </div>
  );
}
