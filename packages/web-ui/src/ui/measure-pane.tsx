'use client';

import { useDefaultLayout } from 'react-resizable-panels';

import { cn } from '../lib/utils';
import useMediaQuery from '../hooks/use-media-query';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable';

const CONTENT = 'content';
const SPACER = 'spacer';

/** Tailwind's `md`, the same breakpoint `MasterDetail` uses. */
const DESKTOP = '(min-width: 768px)';

/** What `useDefaultLayout` reads on the SERVER — see the long note in
 *  `master-detail.tsx`. It must not be `undefined`, or the hook falls back to a
 *  `localStorage` that does not exist in Node and the subtree de-opts to
 *  client-only rendering with a `getItem` of undefined. */
const NO_STORAGE = { getItem: () => null, setItem: () => {} };

/**
 * `MasterDetail`'s third panel, on its own — content plus an empty spacer, with
 * a draggable, remembered edge between them.
 *
 * For a FULL-PAGE route that holds reading text and has no list beside it. Such
 * a route has nothing to drag against, so it ends up choosing between two bad
 * defaults: stretch to the window and run 1400px line lengths, or hard-code a
 * `max-w-*` and let the reader do nothing about it. The `/pages` editor did the
 * second, with a narrow/wide button standing in for a measure.
 *
 * The spacer is empty by design. It exists only to give the content a right
 * edge, exactly as it does in the master-detail scaffold, and `minSize="0px"`
 * lets the drag run it to nothing so the ceiling is the window itself.
 *
 * Below `md` there are no panels: the content is the whole width, because a
 * phone has no slack to park in a spacer.
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
  const key = `measure-pane:${id}`;

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: key,
    panelIds: [CONTENT, SPACER],
    // A window resize shouldn't overwrite a width the reader chose.
    onlySaveAfterUserInteractions: true,
    storage: typeof window === 'undefined' ? NO_STORAGE : window.localStorage,
  });

  // `isDesktop` is null until the first effect runs. Full width is the right
  // fallback: it is what the small-screen layout does anyway, so a narrow load
  // lands on its final shape instead of flashing a measure first.
  if (!isDesktop) return <div className={cn('h-full min-h-0', className)}>{children}</div>;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={key}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn('h-full min-h-0 items-stretch overflow-hidden', className)}
    >
      {/* No `maxSize`: "no limit" is the point. The drag stops when the spacer
          is gone, which is the window minus whatever rails the shell holds. */}
      <ResizablePanel id={CONTENT} defaultSize={defaultSize} minSize={minSize} maxSize="100%">
        <div className="h-full min-h-0">{children}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id={SPACER} minSize="0px" />
    </ResizablePanelGroup>
  );
}
