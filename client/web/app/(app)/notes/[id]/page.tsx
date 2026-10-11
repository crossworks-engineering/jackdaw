import { RedirectTo, RoleSwitch } from '@/components/layout/shell-role';
import { MemberGoToList } from '@/components/member/member-go-to-list';

/**
 * Deep link to a single note. Notes live on one resizable screen with an in-pane
 * editor, so a direct `/notes/[id]` URL just redirects into `/notes` with that
 * note selected + opened in the editor. The list resolves the note client-side
 * (`/api/notes/[id]`) and shows a not-found state if it's gone — no SSR DB read
 * needed here (Phase 2 · Task 4).
 *
 * A member's link may name a note in any of their sources (Mine, the Library,
 * Accepted), so for a member the source is found first, as /pages/<id> and
 * /draw/<id> do. Which one is the brain's role, from the shell (phase W5c),
 * so the redirect happens in the browser.
 */
export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleSwitch member={<MemberGoToList path="/notes" id={id} />}>
      <RedirectTo href={`/notes?selected=${encodeURIComponent(id)}&edit=1`} />
    </RoleSwitch>
  );
}
