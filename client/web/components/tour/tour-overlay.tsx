'use client';

import * as React from 'react';
import { Button } from '@mantle/web-ui/ui/button';
import { placeCard, type Size } from '@/lib/tour/model';
import { useTour } from './tour-provider';

/**
 * What the tour looks like: the screen dimmed except for a spotlight on the
 * step's element, and one card beside it saying what the element is.
 *
 * Two layers, both above every rail and dock (z-50), both `fixed` so a
 * scrolling <main> cannot carry them off:
 *
 *  - the dim is an SVG with a mask — a full-viewport rectangle in a
 *    foreground tint with the spotlight punched out of it, plus a stroke
 *    around the hole. A mask is the whole trick: one shape, no four-panel
 *    arithmetic, and the tint is a THEME token (`fill-foreground/40`), so it
 *    is a darkening on a light theme and a lightening on a dark one without
 *    a colour of its own. It is `pointer-events-none` on purpose: the
 *    highlighted control stays clickable — a tour that locks the screen it
 *    is describing teaches less than one that lets you try things.
 *  - the card is an opaque popover surface (floating layers are never
 *    translucent — see the style guide, §2a), placed by `placeCard` so it
 *    stays inside the viewport whichever side it lands on.
 *
 * Keyboard: → or Enter advances, ← goes back, Esc dismisses — unless the
 * focus is in something that types. The card takes focus on every step so a
 * screen reader hears the change; it is a non-modal dialog because the page
 * behind it is meant to remain usable.
 */

const DEFAULT_CARD: Size = { width: 320, height: 180 };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function TourOverlay() {
  const { active, rect, next, back, dismiss } = useTour();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [card, setCard] = React.useState<Size>(DEFAULT_CARD);
  const [viewport, setViewport] = React.useState<Size>({ width: 0, height: 0 });

  // The viewport and the card's own size are both browser facts; read them in
  // effects so the server render (nothing — the tour is never active there)
  // and the client's first render agree.
  React.useEffect(() => {
    if (!active) return;
    const read = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [active]);

  // The card's size is read two ways, and both depend on `viewport` as well
  // as the step: the card is not rendered until the viewport is known, so an
  // observer attached before that finds nothing to watch and the placement
  // would keep using DEFAULT_CARD — which on the live demo (2026-09-17) put
  // a 293px card at the slot for a 180px one and pushed its buttons 100px
  // below a 720px-tall window. The layout effect measures synchronously on
  // every step, before paint; the observer then follows growth within a step
  // (fonts arriving, text wrapping) that no re-render would otherwise notice.
  React.useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || !active) return;
    const measured = { width: el.offsetWidth, height: el.offsetHeight };
    setCard((c) => (c.width === measured.width && c.height === measured.height ? c : measured));
  }, [active, viewport]);

  React.useEffect(() => {
    const el = cardRef.current;
    if (!el || !active) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Border-box, not content-box: the placement needs the whole card.
      setCard({ width: el.offsetWidth || width, height: el.offsetHeight || height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, viewport]);

  // Focus the card on every step; keyboard walks the tour.
  React.useEffect(() => {
    if (!active) return;
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, back, dismiss]);

  if (!active || viewport.width === 0) return null;

  const { tour, step, index } = active;
  const last = index === tour.steps.length - 1;
  const pos = placeCard(rect, card, viewport, step.side);
  const titleId = `tour-${tour.id}-title`;
  const bodyId = `tour-${tour.id}-body`;

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
        width={viewport.width}
        height={viewport.height}
      >
        <defs>
          <mask id="tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          className="fill-foreground/40"
          mask="url(#tour-spotlight)"
        />
        {rect && (
          <rect
            x={rect.left}
            y={rect.top}
            width={rect.width}
            height={rect.height}
            rx="8"
            className="fill-none stroke-primary"
            strokeWidth="2"
          />
        )}
      </svg>

      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        data-tour-card
        data-side={pos.side}
        style={{ top: pos.top, left: pos.left }}
        className="fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="text-xs text-muted-foreground">
          {tour.title} · {index + 1} of {tour.steps.length}
        </p>
        <h2 id={titleId} className="mt-1 text-sm font-semibold">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} className="mr-auto">
            Skip tour
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={back} disabled={index === 0}>
            Back
          </Button>
          <Button type="button" size="sm" onClick={next}>
            {last ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </>
  );
}
