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
 * `ZoomableImages` is the whole integration surface: wrap any block of
 * rendered content and every real <img> inside becomes clickable — TipTap
 * nodes, ReactMarkdown output and plain markup alike, with nothing to teach
 * the renderers. Decorative/UI images stay out by size (< 40px) or by
 * putting `data-no-lightbox` on an ancestor.
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

type LightboxImage = { src: string; alt: string };

export function ZoomableImages({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [image, setImage] = useState<LightboxImage | null>(null);

  const onClickCapture = (e: React.MouseEvent) => {
    const el = e.target instanceof HTMLImageElement ? e.target : null;
    if (!el || el.closest('[data-no-lightbox]')) return;
    // Icons/emoji-sized images aren't content; leave them (and their links) be.
    if (el.width < 40 || el.height < 40) return;
    e.preventDefault();
    e.stopPropagation();
    setImage({ src: el.currentSrc || el.src, alt: el.alt || '' });
  };

  return (
    <div className={cn('[&_img]:cursor-zoom-in', className)} onClickCapture={onClickCapture}>
      {children}
      <ImageLightbox image={image} onClose={() => setImage(null)} />
    </div>
  );
}

/** Ref-attach variant for surfaces whose scroller already exists (the chat
 *  threads): hooks a capture-phase click listener on the given container and
 *  renders only the dialog — zero layout impact. Pair it with a
 *  `[&_img]:cursor-zoom-in` class on the container so images invite the
 *  click. */
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
      const el = e.target instanceof HTMLImageElement ? e.target : null;
      if (!el || el.closest('[data-no-lightbox]')) return;
      if (el.width < 40 || el.height < 40) return;
      e.preventDefault();
      e.stopPropagation();
      setImage({ src: el.currentSrc || el.src, alt: el.alt || '' });
    };
    node.addEventListener('click', onClick, true);
    return () => node.removeEventListener('click', onClick, true);
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
  // Live pointers for drag/pinch — refs, not state: gestures must not re-render
  // per event beyond the transform itself.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => setView({ scale: 1, tx: 0, ty: 0 }), [image?.src]);

  /** Zoom to `next` keeping the CONTENT under the viewport point (cx, cy)
   *  stationary — the classic zoom-around-cursor transform. Coordinates are
   *  relative to the viewport centre, matching the flex-centred image. */
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }, []);

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
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const k = scale / v.scale;
        return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
    // Re-attach when the dialog (re)opens — the node only exists while open.
  }, [image?.src]);

  const onPointerDown = (e: React.PointerEvent) => {
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const { cx, cy } = centerOf(e.clientX, e.clientY);
    if (view.scale > 1.01) setView({ scale: 1, tx: 0, ty: 0 });
    else zoomAt(2.5, cx, cy);
  };

  return (
    <Dialog open={image !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="h-dvh max-h-none w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-background/95 p-0"
        data-no-lightbox
      >
        <DialogTitle className="sr-only">{image?.alt || 'Image'}</DialogTitle>
        <div
          ref={viewportRef}
          className={cn(
            'relative flex h-full w-full touch-none items-center justify-center overflow-hidden select-none',
            view.scale > 1.01 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary content bytes; next/image can't optimize them
            <img
              src={image.src}
              alt={image.alt}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
                // No transition while dragging would be ideal; a short one on
                // scale only keeps button/double-click zooms smooth without
                // making pans feel laggy (translate changes are per-frame).
                transition: pointers.current.size ? undefined : 'transform 120ms ease-out',
              }}
            />
          )}
        </div>
        <div
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background/90 p-1 shadow-lg"
          data-no-lightbox
        >
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
          <Button asChild variant="ghost" size="icon" aria-label="Open original in a new tab">
            <a href={image?.src} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
