import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { WorkspacesClient } from './workspaces-client';

/**
 * /settings/workspaces (workspaces W5a, plan 4887b8e7 sections 1.4 and 7.1):
 * the workspaces the login is in (Admin users: all) and the ONE workspace
 * screen beside the list. Data-free: the client reads GET /api/workspaces and
 * GET /api/workspaces/:id and changes them through the same routes.
 */
export default async function WorkspacesSettingsPage() {
  return (
    <>
      <SetPageTitle title="Workspaces" />
      <Suspense>
        <WorkspacesClient />
      </Suspense>
    </>
  );
}
