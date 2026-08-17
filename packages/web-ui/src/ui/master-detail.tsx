'use client';

import { useDefaultLayout } from 'react-resizable-panels';

import { cn } from '../lib/utils';
import useMediaQuery from '../hooks/use-media-query';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable';

const LIST = 'list';
const DETAIL = 'detail';
const SPACER = 'spacer';

/** Tailwind's `md`, the breakpoint the master-detail scaffold has always used. */
const DESKTOP = '(min-width: 768px)';

/**
 * The list + detail scaffold from the style guide (§8), with a draggable
 * divider. Owns the pane classes rather than leaving them to each screen,
 * because the rules that make it work are easy to drop and expensive to debug:
 * both panes need `min-h-0`, and the scrolling detail pane needs `relative` or
 * its overflow escapes into `<main>` and paints a second, clipping scrollbar.
 *
 * The layout is remembered per `id` in `localStorage`, so a width the user drags
 * survives a reload and a return visit.
 *
 * THREE panels, not two. The detail pane holds a measure of reading text, so it
 * gets its own width and a handle on its right edge rather than stretching to
 * whatever the window happens to be: on a wide display a full-bleed form runs
 * to 1200px line lengths and reads badly. The third panel is empty — it exists
 * only to give the detail a right edge to drag against.
 *
 * Below `md` there is no divider and no spacer: the panes stack, exactly as the
 * grid did.
 */
export function MasterDetail({
  id,
  list,
  detail,
  defaultListSize = '340px',
  minListSize = '260px',
  maxListSize = '560px',
  defaultDetailSize = '672px',
  minDetailSize = '420px',
  maxDetailSize = '1100px',
  listFills = false,
  detailFirst = false,
  className,
}: {
  /** Persistence key. Unique per screen — two screens sharing one would share a width. */
  id: string;
  list: React.ReactNode;
  detail: React.ReactNode;
  defaultListSize?: string;
  minListSize?: string;
  maxListSize?: string;
  /** `672px` is `max-w-2xl`, the measure these forms used before they were draggable. */
  defaultDetailSize?: string;
  minDetailSize?: string;
  maxDetailSize?: string;
  /**
   * Invert which side absorbs slack. Default: the list is a fixed column and an
   * empty spacer takes the rest. With `listFills`, the LIST takes the rest and
   * there is no spacer — for a left pane that wants every spare pixel, like the
   * Kanban board's columns. The single handle then sets the detail's width,
   * which is the same gesture either way.
   */
  listFills?: boolean;
  /**
   * Put the detail on the LEFT and the list on the right. The Kanban board
   * reads left-to-right across its columns, so a form pinned to the right edge
   * sits at the end of that sweep; on the left it is where the eye starts.
   * Panel ids do not change, so a saved layout survives the flip.
   */
  detailFirst?: boolean;
  className?: string;
}) {
  const isDesktop = useMediaQuery(DESKTOP);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `master-detail:${id}`,
    panelIds: listFills ? [LIST, DETAIL] : [LIST, DETAIL, SPACER],
    // Window resizes and imperative calls shouldn't overwrite a width the user
    // chose deliberately.
    onlySaveAfterUserInteractions: true,
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
  });

  // `isDesktop` is null until the first effect runs. Falling back to the CSS
  // grid rather than to the stacked layout matters: the grid is responsive on
  // its own, so a desktop load shows the right shape immediately instead of
  // flashing a stacked list before the panels take over.
  if (!isDesktop) {
    const listCell = (
      <div className="flex flex-col border-b border-border md:h-full md:min-h-0 md:border-b-0 md:border-r">
        {list}
      </div>
    );
    const detailCell = (
      <div className="relative md:h-full md:min-h-0 md:overflow-y-auto md:scrollbar-thin">
        {detail}
      </div>
    );
    return (
      <div
        className={cn('md:grid md:h-full md:overflow-hidden', className)}
        style={{
          gridTemplateColumns: detailFirst
            ? `${defaultDetailSize} 1fr`
            : listFills
              ? `1fr ${defaultDetailSize}`
              : `${defaultListSize} 1fr`,
        }}
      >
        {detailFirst ? detailCell : listCell}
        {detailFirst ? listCell : detailCell}
      </div>
    );
  }

  const listPanel = (
    <ResizablePanel
      id={LIST}
      // Sizeless when it fills: the panel group hands it whatever the detail
      // does not take, and the one handle governs the detail.
      defaultSize={listFills ? undefined : defaultListSize}
      minSize={listFills ? '320px' : minListSize}
      maxSize={listFills ? undefined : maxListSize}
    >
      <div className="flex h-full min-h-0 flex-col">{list}</div>
    </ResizablePanel>
  );

  const detailPanel = (
    <ResizablePanel
      id={DETAIL}
      defaultSize={defaultDetailSize}
      minSize={minDetailSize}
      maxSize={maxDetailSize}
    >
      <div className="relative h-full min-h-0 overflow-y-auto scrollbar-thin">{detail}</div>
    </ResizablePanel>
  );

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      id={`master-detail:${id}`}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn('h-full items-stretch overflow-hidden', className)}
    >
      {/* The handle is a 1px `bg-border` rule, so it replaces the border the
          panes would otherwise carry rather than sitting beside it. */}
      {detailFirst ? detailPanel : listPanel}
      <ResizableHandle withHandle />
      {detailFirst ? listPanel : detailPanel}
      {/* Empty by design. It is the detail pane's outer edge, nothing more, so
          the measure stays readable on a wide display instead of the form
          stretching to fill it. `minSize=0` lets it vanish entirely when the
          window is too narrow to afford any slack. Not needed when the list
          fills — there the detail already has a fixed width. */}
      {listFills ? null : (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id={SPACER} minSize="0px" />
        </>
      )}
    </ResizablePanelGroup>
  );
}
