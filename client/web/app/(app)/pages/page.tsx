import { Suspense } from 'react';
import { RoleSwitch } from '@/components/member/viewer-role';
import { RestoreLastOpened } from '@/components/last-opened/last-opened';
import { MemberWorkspace } from '@/components/member/member-workspace';
import { AdminSpaces } from '@/components/member/admin-private-workspace';
import { SetPageTitle } from '@/components/layout/page-title';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { PagesClient } from './pages-client';

/**
 * /pages — rich-document KB (auth gate only). The list/tree, tag facets, and
 * pagination are client-fetched via `GET /api/pages` (Phase 2 · Task 4), keyed
 * off the URL params (`q`/`tag`/`sort`/`page`) which `PagesClient` reads with
 * useSearchParams — hence the Suspense boundary.
 */
export default async function PagesPage() {
  return (
    <>
      <SetPageTitle title="Pages" />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <RestoreLastOpened section="pages">
          <RoleSwitch member={<MemberWorkspace kind="page" />}>
            <AdminSpaces kind="page">
              <PagesClient />
            </AdminSpaces>
          </RoleSwitch>
        </RestoreLastOpened>
      </Suspense>
    </>
  );
}
