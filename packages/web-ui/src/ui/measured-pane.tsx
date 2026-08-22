'use client';

import { useDefaultLayout } from 'react-resizable-panels';

import { cn } from '../lib/utils';
import useMediaQuery from '../hooks/use-media-query';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable';

const CONTENT = 'content';
const SPACER = 'spacer';

/** Tailwind's `md`, the same breakpoint `MasterDetail` has always used. */
const DESKTOP = '(min-width: 768px)';

/** What `useDefaultLayout` reads on the SERVER — see the long note on the same
 *  constant in `master-detail.tsx`. It must not be `undefined`: the hook
 *  defaults that to `localStorage`, which is not a global in Node, and the
 *  server snapshot then calls `.getItem` on nothing. */
const NO_STORAGE = { getItem: () => null, setItem: () => {} };

/**
 * ONE measured column with a draggable right edge — `MasterDetail` minus the
 * list.
 *
 * The settings screens that have no collection behind them (Profile,
 * Appearance, Backups…) were briefly the detail half of a card hub. The cards
 * are gone and those screens are back to being their own destinations in the
 * sidebar, but the pane they sat in was the good part of that change and it
 * stays: a form pinned to a readable measure, draggable when the reader wants
 * more, and remembered.
 *
 * TWO panels, and the second is empty. That is the whole mechanism: the content
 * gets a real width instead of stretching to the window, and the spacer exists
 * only to give it a right edge to pull against. Without it, a form on a wide
 * display runs to 1200px line lengths and reads badly. It is exactly the
 * arrangement `MasterDetail` uses for its detail pane; only the list is absent.
 *
 * Widths are remembered per `id` in `localStorage`, so a drag survives a reload.
 * Give each SCREEN its own id: a shared one makes every screen jump to whatever
 * width was last dragged somewhere else, which reads as a bug rather than as
 * persistence.
 *
 * Below `md` the panels do not mount at all and the content simply fills the
 * width — there is no room to hold a measure and a spacer on a phone.
 */
export function MeasuredPane({
  id,
  children,
  defaultSize = '672px',
  minSize = '420px',
  maxSize = '100%',
  className,
}: {
  /** Persistence key, unique per screen. */
  id: string;
  children: React.ReactNode;
  /** `672px` is `max-w-2xl`, the measure these forms used before they were
   *  draggable. A screen whose content is a GALLERY rather than a form should
   *  say so and open wider. */
  defaultSize?: string;
  minSize?: string;
  /** `100%` by default so the drag can run the spacer down to nothing: the
   *  ceiling is the window minus the rail, not an arbitrary number. */
  maxSize?: string;
  className?: string;
}) {
  const isDesktop = useMediaQuery(DESKTOP);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `measured-pane:${id}`,
    panelIds: [CONTENT, SPACER],
    // A window resize is not a width the reader chose; only a drag is.
    onlySaveAfterUserInteractions: true,
    storage: typeof window === 'undefined' ? NO_STORAGE : window.localStorage,
  });

  // `isDesktop` is null until the first effect runs. Falling back to the plain
  // column rather than to the panels matters: it is responsive on its own, so a
  // narrow load never flashes a measure it cannot honour.
  if (!isDesktop) {
    return (
      <div className={cn('relative h-full min-h-0 overflow-y-auto scrollbar-thin', className)}>
        {children}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={`measured-pane:${id}`}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn('h-full items-stretch overflow-hidden', className)}
    >
      <ResizablePanel id={CONTENT} defaultSize={defaultSize} minSize={minSize} maxSize={maxSize}>
        {/* `relative` is load-bearing: without it this pane's overflow escapes
            into `<main>` and paints a second, clipping scrollbar. */}
        <div className="relative h-full min-h-0 overflow-y-auto scrollbar-thin">{children}</div>
      </ResizablePanel>
      {/* The handle is a 1px `bg-border` rule, so it reads as the pane's edge
          rather than as a bar sitting beside one. */}
      <ResizableHandle withHandle />
      {/* Empty by design — the content's outer edge, nothing more. `minSize=0`
          lets it vanish when the window is too narrow to afford any slack. */}
      <ResizablePanel id={SPACER} minSize="0px" />
    </ResizablePanelGroup>
  );
}
