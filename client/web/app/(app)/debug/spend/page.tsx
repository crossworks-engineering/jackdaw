import { SetPageTitle } from '@/components/layout/page-title';
import { SpendClient } from './spend-client';

/** Debug → Spend: token spend by model and by agent (7d). Data-free —
 *  SpendClient fetches GET /api/debug/spend. */
export default async function DebugSpendPage() {
  return (
    <div className="space-y-8 px-6 py-8">
      <SetPageTitle title="Spend" />
      <SpendClient />
    </div>
  );
}
