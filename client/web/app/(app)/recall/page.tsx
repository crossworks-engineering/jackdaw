import { SetPageTitle } from '@/components/layout/page-title';
import { RecallScreen } from './recall-screen';

/**
 * Recall, the map workshop. Data-free: the page parses the URL state
 * (`selected` map id, deep-linked from the editor lint badge; `view`; `card`,
 * the v2 editor's open card; the search and page) and hands it to
 * RecallScreen, which picks the v2 editor or the v1 screen by what the brain
 * says it can do.
 */
export default async function RecallPage({
  searchParams,
}: {
  searchParams: Promise<{
    selected?: string;
    view?: string;
    card?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <SetPageTitle title="Recall" />
      <RecallScreen
        selected={sp.selected?.trim() || null}
        view={sp.view?.trim() || null}
        card={sp.card?.trim() || null}
        q={sp.q?.trim() || ''}
        page={Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)}
      />
    </>
  );
}
