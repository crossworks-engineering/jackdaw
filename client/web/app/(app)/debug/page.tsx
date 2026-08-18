import { SetPageTitle } from '@/components/layout/page-title';
import { OverviewClient } from './overview-client';

/**
 * Debug → Overview: system health at a glance. Spend / memory / agents /
 * telegram each live on their own tab (see `debug-nav.tsx`). Data-free —
 * OverviewClient fetches the whole bundle from GET /api/debug/overview.
 */
export default async function DebugOverviewPage() {
  return (
    <div className="space-y-8 px-6 py-8">
      <SetPageTitle title="Debug" />
      <OverviewClient />
    </div>
  );
}
