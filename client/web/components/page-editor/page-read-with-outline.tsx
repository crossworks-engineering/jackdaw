'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type JSONContent } from '@tiptap/core';
import { ChevronDown, FileText, ListTree } from 'lucide-react';
import { buildPageToc, type TocEntry } from '@mantle/content-core/page-toc';
import { scrollBehavior } from '@mantle/web-ui/lib/motion';
import { cn } from '@mantle/web-ui/lib/utils';
import { PageOutline } from '@mantle/web-ui/page-outline';
import { RowButton } from '@mantle/web-ui/ui/row-button';
import { PageView } from './page-view';

/**
 * A page, read-only, with its heading outline: what every READER of a page
 * gets (the member Library and personal items, the client portal, the admin
 * Review pane), so the readers cannot drift from each other.
 *
 * Where it fits: the admin preview's layout (pages-client.tsx, PagePreview).
 * A 224px rail on the left, sticky in the reader's own scroller, and the
 * document fills the rest.
 *
 * ONE difference from the admin preview, the trigger. The admin preview fills
 * the window beside its list, so it asks the WINDOW (`xl`). A reader sits in
 * a pane that opens at 672px whatever the window is, where the rail would
 * leave the text a 365px column. So this asks the reader's own width (a
 * container query): the rail shows from 672px of reader, which keeps at
 * least 424px of text, and a pane dragged wider gets it.
 *
 * Narrower than that the admin screens show no outline at all. Members and
 * clients read on phones, so here a compact "On this page" disclosure sits
 * at the top of the document instead: closed until asked for, the same
 * entries, the same jump. It closes again after a jump (the reader asked to
 * go somewhere; an open list above the text is in the way on the way back
 * up). The rail stays as it is.
 *
 * The outline reads the SAME doc the view renders (pass the draft when the
 * view shows the draft). A page with no headings and no sub-page cards gets
 * no rail and no disclosure: the layout is then the bare PageView.
 */
export function PageReadWithOutline({ content, ...view }: React.ComponentProps<typeof PageView>) {
  const toc = useMemo(() => readerToc(content), [content]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const jump = useCallback((id: string) => jumpToBlock(bodyRef.current, id), []);
  return (
    <div className="@container/page-read flex w-full gap-6" ref={bodyRef}>
      {toc.length > 0 && (
        <aside className="hidden w-56 shrink-0 @2xl/page-read:block">
          <div className="sticky top-6 max-h-[calc(100vh-9rem)] overflow-y-auto scrollbar-thin">
            <PageOutline entries={toc} onJump={jump} />
          </div>
        </aside>
      )}
      <div className="min-w-0 flex-1">
        {toc.length > 0 && (
          <OutlineDisclosure entries={toc} onJump={jump} className="@2xl/page-read:hidden" />
        )}
        <PageView content={content} {...view} />
      </div>
    </div>
  );
}

/** The outline of a page as a reader gets it: the admin outline's entries
 *  (headings h1 to h3 and sub-page cards, in document order). A doc that is
 *  not an object gives none. */
export function readerToc(doc: JSONContent | null | undefined): TocEntry[] {
  return buildPageToc(doc);
}

/**
 * Scroll the reader to a block by its stable id.
 *
 * The static render writes block ids as `data-block-id` (block-id.ts avoids
 * the native `id` on purpose), so PageOutline's own getElementById jump finds
 * nothing here. Only the reader's OWN scroller moves (the nearest scrolling
 * ancestor: the member workspace, the client portal and the Review pane each
 * have one), never the window: `scrollIntoView` would also scroll every
 * ancestor that can move. Focus follows to the block, so the keyboard and a
 * screen reader carry on from the section that was asked for.
 */
function jumpToBlock(root: HTMLElement | null, id: string): void {
  const el = root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const scroller = scrollParent(el);
  if (scroller) {
    const top =
      scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: Math.max(0, top - JUMP_GAP), behavior: scrollBehavior() });
  } else {
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/** Air above a heading the reader jumped to (the readers' own top padding). */
const JUMP_GAP = 24;

/** The nearest ancestor that scrolls on the block axis, or null (the window). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return p;
  }
  return null;
}

/**
 * A jump from the disclosure: close the list, THEN jump. The order matters:
 * the list sits above every heading, so the jump has to measure the page as
 * it is once the list is gone, or it lands short by the list's height.
 * `close` must have reached the DOM when it returns (flushSync below).
 */
export function closeThenJump(close: () => void, jump: (id: string) => void, id: string): void {
  close();
  jump(id);
}

/**
 * The outline where the rail does not fit: one row that opens the list. The
 * PageOutline rail's words and entry styles, in a box the width of the
 * document; the list scrolls by itself when a page has many headings, and
 * closes after a jump (closeThenJump).
 */
function OutlineDisclosure({
  entries,
  onJump,
  className,
}: {
  entries: TocEntry[];
  onJump: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const close = () => flushSync(() => setOpen(false));
  return (
    <nav
      aria-label="On this page"
      className={cn('mb-4 rounded-md border border-border bg-card text-sm', className)}
    >
      <RowButton
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ListTree className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 text-[11px] font-semibold tracking-wider uppercase">
          On this page
        </span>
        <span className="text-xs tabular-nums" aria-hidden>
          {entries.length}
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </RowButton>
      <ul
        id={listId}
        hidden={!open}
        className="max-h-64 space-y-0.5 overflow-y-auto border-t border-border p-1 scrollbar-thin"
      >
        {entries.map((e) => (
          <li key={e.id}>
            <RowButton
              onClick={() => closeThenJump(close, onJump, e.id)}
              style={{ paddingLeft: 8 + e.depth * 12 }}
              className={cn(
                'flex min-h-9 w-full items-center gap-1.5 rounded-sm py-1.5 pr-2 leading-snug hover:bg-accent hover:text-accent-foreground',
                e.kind === 'heading' && e.level === 1
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {e.kind === 'page' && (
                <FileText className="size-3.5 shrink-0 opacity-70" aria-hidden />
              )}
              <span className="min-w-0 break-words">{e.label}</span>
            </RowButton>
          </li>
        ))}
      </ul>
    </nav>
  );
}
