import { RedirectTo, RoleSwitch } from '@/components/layout/shell-role';
import { MemberGoToList } from '@/components/member/member-go-to-list';

/**
 * The table editor now lives in the master-detail shell at /tables (resizable,
 * collapsible list on the left, grid on the right). Keep this route as a
 * permanent deep-link → it just selects the table in the shell.
 *
 * A member's link may name a table in any of their sources (Mine, the
 * Library, Accepted), so for a member the source is found first, as
 * /pages/<id> and /draw/<id> do. Which one is the brain's role, from the
 * shell (phase W5c), so the redirect happens in the browser.
 */
export default async function TableByIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleSwitch member={<MemberGoToList path="/tables" id={id} />}>
      <RedirectTo href={`/tables?selected=${encodeURIComponent(id)}`} />
    </RoleSwitch>
  );
}
