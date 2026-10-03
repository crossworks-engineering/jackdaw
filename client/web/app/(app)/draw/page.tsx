import { Suspense } from 'react';
import { RoleSwitch } from '@/components/member/viewer-role';
import { RestoreLastOpened } from '@/components/last-opened/last-opened';
import { MemberWorkspace } from '@/components/member/member-workspace';
import { AdminSpaces } from '@/components/member/admin-private-workspace';
import { SetPageTitle } from '@/components/layout/page-title';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { DrawsClient } from './draws-client';

/**
 * /draw — the whiteboard workspace (auth gate only). The list, tag facets and
 * pagination are client-fetched via `GET /api/draws`, keyed off the URL params
 * which `DrawsClient` reads with useSearchParams — hence the Suspense
 * boundary. The editor lives at /draw/[id]; browsing the list never loads the
 * canvas chunk.
 */
export default async function DrawPage() {
  return (
    <>
      <SetPageTitle title="Draw" />
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <RestoreLastOpened section="draw">
          <RoleSwitch member={<MemberWorkspace kind="draw" />}>
            <AdminSpaces kind="draw">
              <DrawsClient />
            </AdminSpaces>
          </RoleSwitch>
        </RestoreLastOpened>
      </Suspense>
    </>
  );
}
