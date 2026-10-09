'use client';

/**
 * "Needs you" notice at the top of the rail, beside the update notice: how
 * much waits for an admin ("2 waiting for review · 1 open request"), live.
 * Renders NOTHING when nothing waits. Clicking opens the first workspace
 * with an item waiting for approval (or Requests when only requests wait). In the collapsed icon rail the
 * label hides and the icon carries the count.
 */
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { needsYouHref, needsYouLabel, totalWaiting } from '@/lib/needs-you';
import { useNeedsYou } from './use-needs-you';

export function NeedsYouBanner({ onNavigate }: { onNavigate?: () => void }) {
  const needsYou = useNeedsYou();
  const label = needsYouLabel(needsYou);
  if (!label) return null;
  const total = totalWaiting(needsYou);
  return (
    <div className="px-3 pt-3 group-data-[nav-collapsed=true]/shell:px-2">
      <Link
        href={needsYouHref(needsYou)}
        onClick={onNavigate}
        className="relative flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 group-data-[nav-collapsed=true]/shell:justify-center group-data-[nav-collapsed=true]/shell:px-0 group-data-[nav-collapsed=true]/shell:py-2"
        title={label}
        aria-label={`Needs you: ${label}`}
        data-testid="needs-you-banner"
      >
        <Inbox className="size-4 shrink-0" />
        <span className="truncate group-data-[nav-collapsed=true]/shell:hidden">{label}</span>
        <span className="absolute -top-1 -right-1 hidden min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 text-destructive-foreground tabular-nums group-data-[nav-collapsed=true]/shell:block">
          {total > 99 ? '99+' : total}
        </span>
      </Link>
    </div>
  );
}
