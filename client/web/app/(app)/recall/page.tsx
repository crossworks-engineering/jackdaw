import { SetPageTitle } from '@/components/layout/page-title';
import { RecallClient } from './recall-client';

/**
 * Recall — the map workshop. Data-free: the page parses `selected` (a map id,
 * deep-linked from the editor lint badge) and hands it to RecallClient, which
 * fetches the catalog from GET /api/recall/maps via useQuery. Maps are few by
 * construction (a map caps at 100 nodes), so there is no pagination.
 */
export default async function RecallPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <SetPageTitle title="Recall" />
      <RecallClient selected={sp.selected?.trim() || null} />
    </>
  );
}
