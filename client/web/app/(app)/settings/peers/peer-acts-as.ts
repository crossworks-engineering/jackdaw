/**
 * The "Acts as" choices of a peer's MCP access, the pure half. The member
 * logins come from GET /api/users, which the brain opens to the `users` area
 * only: an Admin user without it lists none. The login a peer is bound to
 * stays a choice even then (or when the list does not name it), as "Another
 * login", so the select never shows a blank for a saved binding.
 *
 * A peer keeps only the login it acts as (workspaces W8: no role is kept on
 * the peer, it acts as that login is now, in its workspaces). The owner
 * binding is the owner's login: told by the list's `isOwner` row, else by
 * the viewer's own shell when the viewer is the owner. A brain before W8
 * still sends `actsAsRole`, and 'admin' there is the owner binding too.
 */

export const ACTS_AS_NONE = 'none';
export const ACTS_AS_OWNER = 'owner';

/** A login as GET /api/users lists it (the MCP logins list is gone, W7b). */
export type ActsAsLogin = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  /** The brain's anchor login. */
  isOwner?: boolean;
  disabledAt: string | null;
};

export type ActsAsBinding = {
  actsAsLoginId: string | null;
  /** Sent by a brain before W8 only (PeerRow.actsAsRole went in W8). */
  actsAsRole?: string | null;
};

export type ActsAsOption = { value: string; label: string };

/** The hint under the select for an Admin user without the Users area. */
export const ACTS_AS_NEEDS_USERS =
  'Choosing a member login needs the Users area. Nobody and Owner stay open.';

/** The label of a bound login the list does not name. */
export const ACTS_AS_UNLISTED = 'Another login';

/** Whether GET /api/users may be asked: only once the shell has named the
 *  login's areas and they hold `users`. Unknown areas (the shell has not
 *  answered yet) ask nothing, so no request goes out that the brain refuses. */
export function mayListUsers(areas: readonly string[] | null | undefined): boolean {
  return Array.isArray(areas) && areas.includes('users');
}

/** The owner's login id, as far as the screen can tell: the list's owner
 *  row, else the viewer when the viewer is the owner; null when neither
 *  says. */
export function ownerLoginId(
  users: readonly ActsAsLogin[] | undefined,
  viewer: { loginId: string; isOwner: boolean } | undefined,
): string | null {
  const listed = users?.find((u) => u.isOwner)?.id;
  if (listed) return listed;
  return viewer?.isOwner ? viewer.loginId : null;
}

/** Whether the peer acts as the owner. */
export function actsAsOwner(access: ActsAsBinding, ownerId: string | null): boolean {
  if (access.actsAsRole === 'admin') return true;
  return !!access.actsAsLoginId && access.actsAsLoginId === ownerId;
}

/** The select's value for a binding. */
export function actsAsValue(access: ActsAsBinding, ownerId: string | null): string {
  return actsAsOwner(access, ownerId) ? ACTS_AS_OWNER : (access.actsAsLoginId ?? ACTS_AS_NONE);
}

/** Every choice of the select, in order: nobody, the owner, the member
 *  logins the list names, then the bound login when it names none. */
export function actsAsOptions(
  users: readonly ActsAsLogin[] | undefined,
  access: ActsAsBinding,
  ownerId: string | null,
): ActsAsOption[] {
  const others = (users ?? []).filter((l) => l.role === 'member' && !l.disabledAt);
  const options: ActsAsOption[] = [
    { value: ACTS_AS_NONE, label: 'Nobody (share only)' },
    { value: ACTS_AS_OWNER, label: 'Owner (admin)' },
    ...others.map((l) => ({ value: l.id, label: `${l.displayName || l.email} (member)` })),
  ];
  const bound = actsAsOwner(access, ownerId) ? null : access.actsAsLoginId;
  if (bound && !options.some((o) => o.value === bound)) {
    options.push({ value: bound, label: ACTS_AS_UNLISTED });
  }
  return options;
}
