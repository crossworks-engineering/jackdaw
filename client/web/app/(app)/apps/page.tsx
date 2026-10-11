import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { AppsClient } from './apps-client';

/**
 * /apps: the folder view every workspace has (auth gate only), the same for
 * every login since workspaces W6b (the screen hides what only an Admin user
 * may do). The tree, the search (`?q=`) and the picked app (`?id=`) are
 * client-fetched and read with useSearchParams, hence the Suspense boundary.
 * An app's own screen is /apps/<id>.
 */
export default function AppsPage() {
  return (
    <>
      <SetPageTitle title="Apps" />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <AppsClient />
      </Suspense>
    </>
  );
}
