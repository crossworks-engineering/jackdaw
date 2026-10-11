'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { SharedLinksPanel, type SharedLinkRow } from '@/components/share/shared-links-panel';
import { SHARES_KEY, SHARES_PATH } from '@/lib/shared-links';

/**
 * Settings > Shared links: the links on the left, the selected link's
 * preview on the right (SharedLinksPanel). Deep link: ?share=<id> opens at
 * that link.
 */
export function SharedLinksClient() {
  const share = useSearchParams().get('share') ?? undefined;
  const q = useQuery({
    queryKey: SHARES_KEY,
    queryFn: () => apiFetch<{ shares: SharedLinkRow[] }>(SHARES_PATH),
  });
  if (q.data) {
    return (
      <div className="flex h-full flex-col">
        <SharedLinksPanel rows={q.data.shares} initialSelectedId={share} />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <p>Could not load the shared links.</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}
