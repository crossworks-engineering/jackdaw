import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { SharedLinksClient } from './shared-links-client';

/**
 * /settings/shared-links (W5c: from Team admin, which is gone): every live
 * share link, with its preview, Copy, Open and Revoke. Data-free: the client
 * reads GET /api/team-admin/shares (the kept route). Needs the settings area
 * (lib/workspaces.ts areaForPath).
 */
export default async function SharedLinksSettingsPage() {
  return (
    <>
      <SetPageTitle title="Shared links" />
      <Suspense>
        <SharedLinksClient />
      </Suspense>
    </>
  );
}
