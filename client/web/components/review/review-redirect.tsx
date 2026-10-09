'use client';

/**
 * Where an old Review link lands (Team admin > Review went on 2026-10-09,
 * workspace review pattern): `/review?item=<id>` opens that item in its own
 * workspace, `/review` the first workspace with something waiting (Pages
 * when nothing does). The needs-you notice and an older brain's push link
 * come through here when they cannot name the item's kind.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { REVIEW_WORKSPACE, reviewItemHref, waitingByWorkspace } from '@/lib/workspace-review';
import { useReviewQueue } from './item-review';

export function ReviewRedirect({ item }: { item?: string | null }) {
  const router = useRouter();
  const q = useReviewQueue();
  useEffect(() => {
    if (q.isError) {
      router.replace(REVIEW_WORKSPACE.page.path);
      return;
    }
    if (!q.data) return;
    const row = item ? q.data.items.find((i) => i.id === item) : null;
    if (row) {
      router.replace(reviewItemHref(row.type, row.id));
      return;
    }
    // Handled since, or no item named: where something still waits.
    router.replace(waitingByWorkspace(q.data.items)[0]?.href ?? REVIEW_WORKSPACE.page.path);
  }, [q.data, q.isError, item, router]);
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
