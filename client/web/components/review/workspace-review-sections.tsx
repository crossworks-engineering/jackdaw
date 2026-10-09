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
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { cn } from '@mantle/web-ui/lib/utils';

/** One row: the title, its one line of meta, and a leading mark (a tile). */
export type ReviewSectionRow = {
  id: string;
  title: string;
  meta: string;
  href: string;
  lead?: ReactNode;
  /** Shown beside the title (a version, "inactive"). */
  badge?: ReactNode;
};

function Section({
  id,
  title,
  rows,
  selectedId,
}: {
  id: string;
  title: string;
  rows: ReviewSectionRow[];
  selectedId?: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id} className="space-y-1.5">
      <h2 id={id} className="flex items-center gap-1.5 px-1 text-xs font-semibold">
        {title}
        <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {rows.length}
        </span>
      </h2>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            <ListCard asChild selected={r.id === selectedId}>
              <Link href={r.href}>
                <span className="flex min-w-0 items-center gap-2">
                  {r.lead}
                  <ListCardTitle className="min-w-0 flex-1 truncate text-sm">
                    {r.title || 'Untitled'}
                  </ListCardTitle>
                  {r.badge}
                </span>
                <ListCardMeta className="truncate">{r.meta}</ListCardMeta>
              </Link>
            </ListCard>
          </li>
        ))}
      </ul>
    </section>
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
  if (waiting.length === 0 && shared.length === 0) return null;
  return (
    <div
      className={cn(
        'max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-border p-2 scrollbar-thin',
        className,
      )}
    >
      <Section
        id="review-waiting"
        title="Waiting for approval"
        rows={waiting}
        selectedId={selectedId}
      />
      <Section id="review-shared" title="Shared by members" rows={shared} selectedId={selectedId} />
    </div>
  );
}
