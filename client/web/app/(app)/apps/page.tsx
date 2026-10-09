import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { RoleSwitch } from '@/components/member/viewer-role';
import { MemberApps } from '@/components/member/member-apps';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { AppsClient } from './apps-client';

/**
 * /apps: the folder view every workspace has (auth gate only). The tree, the
 * search (`?q=`) and the picked app (`?id=`) are client-fetched and read with
 * useSearchParams, hence the Suspense boundary. An app's own screen is
 * /apps/<id>.
 */
export default function AppsPage() {
  // A member gets the launcher: team-level published apps, run only.
  return (
    <RoleSwitch member={<MemberApps />}>
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
    </RoleSwitch>
  );
}
