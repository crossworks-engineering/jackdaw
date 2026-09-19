/**
 * Scrollable Component
 * A reusable wrapper that provides styled scrollbars or hidden scrollbars.
 * Use this for consistent scroll behavior across the app.
 */

import React from 'react';
import { cn } from '../lib/utils';

export type ScrollbarStyle = 'hidden' | 'thin' | 'hair' | 'default';

interface ScrollableProps {
  children: React.ReactNode;
  /** Scrollbar style: "hidden" (no scrollbar), "thin" (6px, the app's standard),
   *  "hair" (3px, small popovers only), "default" (browser default) */
  scrollbar?: ScrollbarStyle;
  /** Additional class names */
  className?: string;
  /** HTML element to render, defaults to div */
  as?: 'div' | 'section' | 'aside' | 'main' | 'nav';
}

/**
 * Scrollable container with configurable scrollbar styling.
 *
 * @example
 * // Hidden scrollbar
 * <Scrollable scrollbar="hidden" className="h-full">
 *   {content}
 * </Scrollable>
 *
 * @example
 * // Thin scrollbar
 * <Scrollable scrollbar="thin" className="h-[400px]">
 *   {content}
 * </Scrollable>
 */
export function Scrollable({
  children,
  scrollbar = 'thin',
  className,
  as: Component = 'div',
}: ScrollableProps) {
  // `hair` is written as a refinement ON TOP of `thin`, never alone. The
  // utilities ship in the pinned share-ui package, and against a copy that
  // predates `scrollbar-hair` a lone unknown class would drop the pane to the
  // browser's fat default. Layered, it falls back to thin; with both present
  // the hairline wins because share-ui declares it after.
  const scrollbarClass =
    scrollbar === 'hidden'
      ? 'scrollbar-hidden'
      : scrollbar === 'thin'
        ? 'scrollbar-thin'
        : scrollbar === 'hair'
          ? 'scrollbar-thin scrollbar-hair'
          : '';

  return (
    <Component className={cn('overflow-y-auto', scrollbarClass, className)}>{children}</Component>
  );
}
