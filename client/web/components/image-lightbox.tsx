'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@mantle/web-ui/lib/utils';
import { Button } from '@mantle/web-ui/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@mantle/web-ui/ui/dialog';

/**
 * Fullscreen image viewer for INLINE CONTENT images — chat replies, forum
 * posts, and page reading. Click an image → big-screen modal; zoom with the
 * wheel / trackpad pinch / touch pinch / the buttons; drag to pan;
 * double-click toggles zoom; Escape or the close button exits.
 *
 * `ZoomableImages` wraps a block of rendered content; `LightboxImages`
 * attaches to an existing scroller by ref. Both share ONE predicate
 * (`lightboxTarget`): a real, LOADED <img> of content size (≥40px) that is
 * NOT inside a link — a linked image keeps its navigation — and not under a
 * `data-no-lightbox` ancestor. The zoom-in cursor is set from the same
 * predicate on hover, so the affordance can never disagree with the behavior.
 *
 * The viewer works on a COPY of volatile sources: blob: URLs belong to the
 * component that minted them (team-surface images revoke on unmount), so the
 * bytes are re-fetched into the lightbox's own object URL. The clicked
 * element's computed CSS filter and background ride along too — a drawing
 * embed shown dark-inverted must zoom dark-inverted.
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

type LightboxImage = {
  src: string;
  alt: string;
  /** Computed styles copied from the clicked element (draw embeds: dark-mode
   *  invert filter and the white mat). */
  filter?: string;
  background?: string;
};

/** The ONE decision of what is lightbox-able. Not-yet-loaded images are
 *  excluded (their rendered size is meaningless); linked images keep their
 *  link. */
function lightboxTarget(t: EventTarget | null): HTMLImageElement | null {
  const el = t instanceof HTMLImageElement ? t : null;
  if (!el || !el.complete || el.naturalWidth === 0) return null;
  if (el.width < 40 || el.height < 40) return null;
  if (el.closest('a, [data-no-lightbox]')) return null;
  return el;
}

function imageFrom(el: HTMLImageElement): LightboxImage {
  const style = getComputedStyle(el);
  return {
    src: el.currentSrc || el.src,
    alt: el.alt || '',
    ...(style.filter && style.filter !== 'none' ? { filter: style.filter } : {}),
    ...(style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ? { background: style.backgroundColor }
      : {}),
  };
}

/** Cursor affordance from the SAME predicate as the click — set lazily on
 *  hover (rendered size is only knowable then), cleared when disqualified. */
function hoverCursor(e: Event) {
  if (!(e.target instanceof HTMLImageElement)) return;
  e.target.style.cursor = lightboxTarget(e.target) ? 'zoom-in' : '';
}

export function ZoomableImages({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [image, setImage] = useState<LightboxImage | null>(null);

  const onClickCapture = (e: React.MouseEvent) => {
    const el = lightboxTarget(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    setImage(imageFrom(el));
  };

  return (
    <div
      className={className}
      onClickCapture={onClickCapture}
      onMouseOverCapture={(e) => hoverCursor(e.nativeEvent)}
    >
      {children}
      <ImageLightbox image={image} onClose={() => setImage(null)} />
    </div>
  );
}

/** Ref-attach variant for surfaces whose scroller already exists (the chat
 *  threads): hooks capture-phase click + hover listeners on the container and
 *  renders only the dialog — zero layout impact. */
export function LightboxImages({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [image, setImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onClick = (e: MouseEvent) => {
      const el = lightboxTarget(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      setImage(imageFrom(el));
    };
    node.addEventListener('click', onClick, true);
    node.addEventListener('mouseover', hoverCursor, true);
    return () => {
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('mouseover', hoverCursor, true);
    };
  }, [containerRef]);

  return <ImageLightbox image={image} onClose={() => setImage(null)} />;
}

export function ImageLightbox({
  image,
  onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // One state object: scale + pan move together in every gesture.
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  // True while a gesture owns the transform — pointer drag/pinch AND wheel
  // bursts. State, not a ref read during render: the transition choice must
  // be deterministic per commit.
  const [gesturing, setGesturing] = useState(false);
  const wheelIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live pointers for drag/pinch — refs, not state: gestures must not
  // re-render per event beyond the transform itself.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  // Drag bookkeeping: a release that actually MOVED must not count toward a
  // double-click (two quick nudge-pans otherwise synthesize one and reset
  // the user's zoom).
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const lastDragEnd = useRef(0);

  // The viewer's own copy of a volatile source: blob: URLs are revoked by
  // whoever minted them (possibly while this dialog is open), so re-fetch
  // the bytes — still alive at click time — into an owned URL.
  const [display, setDisplay] = useState<LightboxImage | null>(null);
  useEffect(() => {
    if (!image) {
      setDisplay(null);
      return;
    }
    if (!image.src.startsWith('blob:')) {
      setDisplay(image);
      return;
    }
    let own: string | null = null;
    let live = true;
    fetch(image.src)
      .then((r) => r.blob())
      .then((b) => {
        own = URL.createObjectURL(b);
        if (live) setDisplay({ ...image, src: own });
      })
      // Source already gone — show it anyway; it may still be cached.
      .catch(() => live && setDisplay(image));
    return () => {
      live = false;
      if (own) URL.revokeObjectURL(own);
    };
  }, [image]);

  // Fresh gesture state every open/close — a drag interrupted by Escape
  // unmounts the viewport before its pointerup, and a surviving entry makes
  // hover pan (mouse) or one finger read as a pinch (touch) next time.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setGesturing(false);
    pointers.current.clear();
    pinchStart.current = null;
  }, [image]);

  /** Zoom keeping the CONTENT under the viewport point (cx, cy) stationary.
   *  `next` is absolute or a function of the previous scale (the wheel path). */
  const zoomAt = useCallback(
    (next: number | ((prev: number) => number), cx: number, cy: number) => {
      setView((v) => {
        const want = typeof next === 'function' ? next(v.scale) : next;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, want));
        const k = scale / v.scale;
        return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
      });
    },
    [],
  );

  const centerOf = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return {
      cx: clientX - rect.left - rect.width / 2,
      cy: clientY - rect.top - rect.height / 2,
    };
  };

  // Wheel zoom (covers trackpad pinch too — it arrives as ctrl+wheel). A
  // native non-passive listener, because React's synthetic wheel handlers are
  // passive and can't preventDefault the page scroll behind the dialog.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.006 : 0.0015));
      const { cx, cy } = centerOf(e.clientX, e.clientY);
      // A wheel burst is a gesture: the 120ms ease would restart per tick and
      // drag the anchor visibly off the cursor.
      setGesturing(true);
      if (wheelIdle.current) clearTimeout(wheelIdle.current);
      wheelIdle.current = setTimeout(() => setGesturing(false), 150);
      zoomAt((s) => s * factor, cx, cy);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (wheelIdle.current) clearTimeout(wheelIdle.current);
    };
    // Re-attach when the dialog (re)opens — the node only exists while open.
  }, [image, zoomAt]);

  const endPointer = (pointerId: number) => {
    pointers.current.delete(pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) setGesturing(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only the primary button drags — a right-click's pointerup is routinely
    // swallowed by the context menu, which would leave a ghost entry.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt.current = { x: e.clientX, y: e.clientY };
    setGesturing(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      // Touch pinch: scale by distance ratio, anchored at the midpoint.
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const { cx, cy } = centerOf((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      zoomAt(pinchStart.current.scale * (dist / pinchStart.current.dist), cx, cy);
    } else if (pointers.current.size === 1) {
      setView((v) => ({ ...v, tx: v.tx + e.clientX - prev.x, ty: v.ty + e.clientY - prev.y }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (downAt.current) {
      const moved = Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y);
      if (moved > 8) lastDragEnd.current = Date.now();
      downAt.current = null;
    }
    endPointer(e.pointerId);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Two quick nudge-pans within the browser's dblclick slop synthesize a
    // double-click; resetting the zoom the user just framed would be hostile.
    if (Date.now() - lastDragEnd.current < 500) return;
    const { cx, cy } = centerOf(e.clientX, e.clientY);
    if (view.scale > 1.01) setView({ scale: 1, tx: 0, ty: 0 });
    else zoomAt(2.5, cx, cy);
  };

  /** "Open original": data:/blob: sources can't be navigated to top-frame,
   *  so hand the browser an owned object URL instead. */
  const openOriginal = async () => {
    const src = display?.src;
    if (!src) return;
    if (/^(data|blob):/.test(src)) {
      try {
        const blob = await (await fetch(src)).blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        // Source gone — nothing sane to open.
      }
    } else {
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Dialog open={image !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="h-dvh max-h-none w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-background/95 p-0"
        // Load-bearing for the WRAPPER variant: the portal's React events
        // still propagate through the component tree to onClickCapture, and
        // without this a click on the zoomed image would re-open it.
        data-no-lightbox
      >
        <DialogTitle className="sr-only">{image?.alt || 'Image'}</DialogTitle>
        <div
          ref={viewportRef}
          className={cn(
            'relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden',
            view.scale > 1.01 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => endPointer(e.pointerId)}
          onLostPointerCapture={(e) => endPointer(e.pointerId)}
          onDoubleClick={onDoubleClick}
        >
          {display && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary content bytes; next/image can't optimize them
            <img
              src={display.src}
              alt={display.alt}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
                transition: gesturing ? undefined : 'transform 120ms ease-out',
                // The source element's presentation travels with the bytes:
                // a dark-inverted drawing embed must zoom dark-inverted, and
                // a matted drawing keeps its mat.
                filter: display.filter,
                backgroundColor: display.background,
              }}
            />
          )}
        </div>
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-lg">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            onClick={() => zoomAt(view.scale / 1.5, 0, 0)}
          >
            <ZoomOut aria-hidden />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(view.scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            onClick={() => zoomAt(view.scale * 1.5, 0, 0)}
          >
            <ZoomIn aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reset zoom"
            onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
          >
            <Maximize aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open original in a new tab"
            onClick={() => void openOriginal()}
          >
            <ExternalLink aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
