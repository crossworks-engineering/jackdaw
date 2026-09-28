import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MemberGoToList } from '@/components/member/member-go-to-list';
import { MEMBER_HINT_COOKIE } from '@/lib/member-surface';

/**
 * Deep link to a single note. Notes live on one resizable screen with an in-pane
 * editor, so a direct `/notes/[id]` URL just redirects into `/notes` with that
 * note selected + opened in the editor. The list resolves the note client-side
 * (`/api/notes/[id]`) and shows a not-found state if it's gone — no SSR DB read
 * needed here (Phase 2 · Task 4).
 *
 * A member's link may name a note in any of their sources (Mine, Team drafts,
 * the Library, Accepted), so for a member the source is found first, as
 * /pages/<id> and /draw/<id> do. The member hint is the same UX-only cookie
 * the (app) layout picks the shell by, so the two always agree.
 */
export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await cookies()).get(MEMBER_HINT_COOKIE)?.value === '1') {
    return <MemberGoToList path="/notes" id={id} />;
  }
  redirect(`/notes?selected=${id}&edit=1`);
}
