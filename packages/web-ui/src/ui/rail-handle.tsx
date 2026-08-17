'use client';

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
}) {
  const dragging = useRef(false);
  const clamp = useCallback((px: number) => Math.min(max, Math.max(min, px)), [min, max]);

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
        onDraggingChange?.(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        onChange(clamp(side === 'right' ? e.clientX : window.innerWidth - e.clientX));
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        onDraggingChange?.(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
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
    />
  );
}
