/**
 * Who wrote an accepted item, in words (member logins Phase 4, client
 * logins audit B26). The brain names the author's login, "A member" when
 * it has no display name; a brain with the audit fixes also says the
 * author's role, and a CLIENT author is never called a member: the badge
 * reads "Client-authored", and a nameless client is "Client". A brain that
 * does not say the role is read as before. Pure, pinned by
 * item-author.test.ts.
 */
import type { MemberItemAuthor } from './contract-next';

/** The brain's name for an author login with no display name. */
const NAMELESS_MEMBER = 'A member';

const isClient = (a: Pick<MemberItemAuthor, 'role'>) => a.role === 'client';

/** The badge beside "Written by". (`name` is in the type so an author from
 *  the pinned contract, which has no `role` yet, is accepted.) */
export function authorBadgeText(a: Pick<MemberItemAuthor, 'name' | 'role'>): string {
  return isClient(a) ? 'Client-authored' : 'Member-authored';
}

/** The author's name as shown: "Client" for a nameless client. */
export function authorName(a: Pick<MemberItemAuthor, 'name' | 'role'>): string {
  const name = a.name.trim();
  if (isClient(a) && (!name || name === NAMELESS_MEMBER)) return 'Client';
  return name || NAMELESS_MEMBER;
}
