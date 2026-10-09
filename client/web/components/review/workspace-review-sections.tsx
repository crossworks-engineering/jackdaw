'use client';

/**
 * The two review sections a workspace screen shows above its normal tree
 * (workspace review pattern, 2026-10-09): "Waiting for approval" (what
 * members submitted) and "Shared by members" (what members shared with the
 * team). Each hides while empty, and the whole block renders nothing when
 * both are. Generic over the kind: the workspace hands in its rows already
 * worded, and where a row opens (its normal item screen, with the banner).
 * Apps use it first (member-apps-review.tsx); pages, notes, tables, draws
 * and files follow (mantle docs/plans/workspace-review-pattern.md).
 * `ReviewSections` is the general form: a member's workspace shows its own
 * groups with it (member-item-sections.tsx).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { cn } from '@mantle/web-ui/lib/utils';

/** One row: the title, its one line of meta, and a leading mark (a tile).
 *  It opens by `href` (a link), or by `onSelect` on a screen that opens it
 *  in its own detail pane. `id` is the row's key and what `selectedId`
 *  matches. */
export type ReviewSectionRow = {
  id: string;
  title: string;
  meta: string;
  href?: string;
  onSelect?: () => void;
  lead?: ReactNode;
  /** Shown beside the title (a version, "inactive"). */
  badge?: ReactNode;
};

/** One section: its rows, and a line under them (more than it shows). */
export type ReviewSection = {
  id: string;
  title: string;
  rows: ReviewSectionRow[];
  /** The number in the title's dot; defaults to the rows shown. */
  count?: number;
  foot?: string;
};

function Count({ n }: { n: number }) {
  return (
    <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
      {n}
    </span>
  );
}

function RowBody({ r }: { r: ReviewSectionRow }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {r.lead}
        <ListCardTitle className="min-w-0 flex-1 truncate text-sm">
          {r.title || 'Untitled'}
        </ListCardTitle>
        {r.badge}
      </span>
      <ListCardMeta className="truncate">{r.meta}</ListCardMeta>
    </>
  );
}

function Rows({ rows, selectedId }: { rows: ReviewSectionRow[]; selectedId?: string | null }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.id}>
          {r.href ? (
            <ListCard asChild selected={r.id === selectedId}>
              <Link href={r.href}>
                <RowBody r={r} />
              </Link>
            </ListCard>
          ) : (
            <ListCard selected={r.id === selectedId} onClick={r.onSelect}>
              <RowBody r={r} />
            </ListCard>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({
  section: { id, title, rows, count, foot },
  selectedId,
  collapsible,
}: {
  section: ReviewSection;
  selectedId?: string | null;
  collapsible?: boolean;
}) {
  if (rows.length === 0) return null;
  const footLine = foot ? <p className="px-1 text-xs text-muted-foreground">{foot}</p> : null;
  if (collapsible) {
    // Open to start; a click on the title folds it for this visit.
    return (
      <details open className="group space-y-1.5">
        <summary
          id={id}
          className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm px-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          />
          {title}
          <Count n={count ?? rows.length} />
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <Rows rows={rows} selectedId={selectedId} />
          {footLine}
        </div>
      </details>
    );
  }
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <h2 id={id} className="flex items-center gap-1.5 px-1 text-xs font-semibold">
        {title}
        <Count n={count ?? rows.length} />
      </h2>
      <Rows rows={rows} selectedId={selectedId} />
      {footLine}
    </section>
  );
}

/** Any set of sections above a tree, each hidden while empty; nothing at
 *  all when every one is. `collapsible`: each title folds its section. */
export function ReviewSections({
  sections,
  selectedId,
  collapsible = false,
  className,
}: {
  sections: ReviewSection[];
  selectedId?: string | null;
  collapsible?: boolean;
  className?: string;
}) {
  if (sections.every((s) => s.rows.length === 0)) return null;
  return (
    <div
      className={cn(
        'max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-border p-2 scrollbar-thin',
        className,
      )}
    >
      {sections.map((s) => (
        <Section key={s.id} section={s} selectedId={selectedId} collapsible={collapsible} />
      ))}
    </div>
  );
}

export function WorkspaceReviewSections({
  waiting,
  shared,
  selectedId,
  className,
}: {
  waiting: ReviewSectionRow[];
  shared: ReviewSectionRow[];
  selectedId?: string | null;
  className?: string;
}) {
  return (
    <ReviewSections
      sections={[
        { id: 'review-waiting', title: 'Waiting for approval', rows: waiting },
        { id: 'review-shared', title: 'Shared by members', rows: shared },
      ]}
      selectedId={selectedId}
      className={className}
    />
  );
}
