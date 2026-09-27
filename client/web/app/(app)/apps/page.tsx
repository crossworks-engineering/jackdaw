import { SetPageTitle } from '@/components/layout/page-title';
import { RoleSwitch } from '@/components/member/viewer-role';
import { MemberApps } from '@/components/member/member-apps';
import { AppsClient } from './apps-client';

/** Valid sort keys (mirrors `@mantle/content`'s AppSort) — kept local so the
 *  page stays free of the server data package. */
const SORTS = ['edited', 'newest', 'oldest', 'title'] as const;

/**
 * Apps list: data-free. The page only parses the URL params (search/sort/page)
 * and hands them to AppsClient, which fetches the page of apps from
 * GET /api/apps via useQuery. `useListNav` keeps the params in the URL.
 */
export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; sort?: string }>;
}) {
  const sp = await searchParams;

  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const query = sp.q?.trim() || '';
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? '') ? sp.sort! : 'edited';

  // A member gets the launcher: team-level published apps, run only.
  return (
    <RoleSwitch member={<MemberApps />}>
      <SetPageTitle title="Apps" />
      <AppsClient page={page} query={query} sort={sort} />
    </RoleSwitch>
  );
}
