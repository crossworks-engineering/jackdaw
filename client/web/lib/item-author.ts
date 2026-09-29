/**
 * Who wrote an accepted item, in words (member logins Phase 4, client
 * logins audit B26). The brain names the author's login ("A member" when a
 * member has no display name); a brain with the audit fixes also says the
 * role, and names a client with no display name "A client". A CLIENT author
 * is never called a member: the badge reads "Client-authored", and a
 * nameless client is "A client" whatever an older naming said. A brain that
 * does not say the role is read as before. Pure, pinned by
 * item-author.test.ts.
 */
import type { MemberItemAuthor } from '@mantle/client-types';

/** The brain's names for an author login with no display name. */
const NAMELESS_MEMBER = 'A member';
const NAMELESS_CLIENT = 'A client';

const isClient = (a: Pick<MemberItemAuthor, 'role'>) => a.role === 'client';

/** The badge beside "Written by". (`name` is in the type so an author from
 *  the pinned contract, which has no `role` yet, is accepted.) */
export function authorBadgeText(a: Pick<MemberItemAuthor, 'name' | 'role'>): string {
  return isClient(a) ? 'Client-authored' : 'Member-authored';
}

/** The author's name as shown: "A client" for a nameless client. */
export function authorName(a: Pick<MemberItemAuthor, 'name' | 'role'>): string {
  const name = a.name.trim();
  if (isClient(a) && (!name || name === NAMELESS_MEMBER)) return NAMELESS_CLIENT;
  return name || NAMELESS_MEMBER;
}
