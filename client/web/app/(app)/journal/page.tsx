import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { JournalClient } from './journal-client';

/**
 * /journal — auth gate only. Three views (You / Agent notes / Questions), the
 * paginated list (filtered by kind/tag/search), tag facets, and the deep-linked
 * selected entry are client-fetched via `/api/journal(/[id])`, keyed off the
 * URL params which `JournalClient` reads with useSearchParams — hence the
 * Suspense boundary.
 */
export default async function JournalPage() {
  return (
    <>
      <SetPageTitle title="Journal" />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <JournalClient />
      </Suspense>
    </>
  );
}
