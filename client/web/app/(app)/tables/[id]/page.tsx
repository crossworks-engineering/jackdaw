import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MemberGoToList } from '@/components/member/member-go-to-list';
import { MEMBER_HINT_COOKIE } from '@/lib/member-surface';

/**
 * The table editor now lives in the master-detail shell at /tables (resizable,
 * collapsible list on the left, grid on the right). Keep this route as a
 * permanent deep-link → it just selects the table in the shell.
 *
 * A member's link may name a table in any of their sources (Mine, Team
 * drafts, the Library, Accepted), so for a member the source is found first,
 * as /pages/<id> and /draw/<id> do. The member hint is the same UX-only
 * cookie the (app) layout picks the shell by, so the two always agree.
 */
export default async function TableByIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await cookies()).get(MEMBER_HINT_COOKIE)?.value === '1') {
    return <MemberGoToList path="/tables" id={id} />;
  }
  redirect(`/tables?selected=${encodeURIComponent(id)}`);
}
