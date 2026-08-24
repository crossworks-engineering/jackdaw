import { SetPageTitle } from '@/components/layout/page-title';
import { RecallClient } from './recall-client';

/**
 * Recall — the map workshop. Data-free: the page parses `selected` (a map id,
 * deep-linked from the editor lint badge) and `view` (the Map/Nodes tab) and
 * hands them to RecallClient, which fetches the catalog from
 * GET /api/recall/maps via useQuery. Maps are few by construction (a map caps
 * at 100 nodes), so there is no pagination.
 */
export default async function RecallPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string; view?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <SetPageTitle title="Recall" />
      <RecallClient
        selected={sp.selected?.trim() || null}
        view={sp.view === 'nodes' ? 'nodes' : 'map'}
        q={sp.q?.trim() || ''}
        page={Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)}
      />
    </>
  );
}
