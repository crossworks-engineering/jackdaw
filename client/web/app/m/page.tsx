import { redirect } from 'next/navigation';

/**
 * The old member Library. Members work in the app shell now: the Library is a
 * source on each kind's screen (Pages, Notes, …), and the member home lists
 * what is new in it.
 */
export default function MemberLibraryPage() {
  redirect('/');
}
