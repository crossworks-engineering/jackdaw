/**
 * The "Acts as" choices of a peer's MCP access, the pure half. The member and
 * client logins come from GET /api/users, which the brain opens to the
 * `users` area only: an Admin user without it lists none. The login a peer is
 * bound to stays a choice even then (or when the list does not name it), as
 * "Another login" (it may be a member or a client), so the select never shows
 * a blank for a saved binding.
 */

export const ACTS_AS_NONE = 'none';
export const ACTS_AS_OWNER = 'owner';

/** A login as GET /api/users lists it (the MCP logins list is gone, W7b). */
export type ActsAsLogin = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  disabledAt: string | null;
};

export type ActsAsBinding = {
  actsAsLoginId: string | null;
  actsAsRole: 'admin' | 'member' | 'client' | null;
};

export type ActsAsOption = { value: string; label: string };

/** The hint under the select for an Admin user without the Users area. */
export const ACTS_AS_NEEDS_USERS =
  'Choosing a member or client login needs the Users area. Nobody and Owner stay open.';

/** The label of a bound login the list does not name: a member or a client. */
export const ACTS_AS_UNLISTED = 'Another login';

/** Whether GET /api/users may be asked: only once the shell has named the
 *  login's areas and they hold `users`. Unknown areas (the shell has not
 *  answered yet) ask nothing, so no request goes out that the brain refuses. */
export function mayListUsers(areas: readonly string[] | null | undefined): boolean {
  return Array.isArray(areas) && areas.includes('users');
}

/** The select's value for a binding. */
export function actsAsValue(access: ActsAsBinding): string {
  return access.actsAsRole === 'admin' ? ACTS_AS_OWNER : (access.actsAsLoginId ?? ACTS_AS_NONE);
}

/** Every choice of the select, in order: nobody, the owner, the member and
 *  client logins the list names, then the bound login when it names none. */
export function actsAsOptions(
  users: readonly ActsAsLogin[] | undefined,
  access: ActsAsBinding,
): ActsAsOption[] {
  const others = (users ?? []).filter(
    (l) => (l.role === 'member' || l.role === 'client') && !l.disabledAt,
  );
  const options: ActsAsOption[] = [
    { value: ACTS_AS_NONE, label: 'Nobody (share only)' },
    { value: ACTS_AS_OWNER, label: 'Owner (admin)' },
    ...others.map((l) => ({
      value: l.id,
      label: (l.displayName || l.email) + (l.role === 'client' ? ' (client)' : ' (member)'),
    })),
  ];
  const bound = access.actsAsRole !== 'admin' ? access.actsAsLoginId : null;
  if (bound && !options.some((o) => o.value === bound)) {
    options.push({ value: bound, label: ACTS_AS_UNLISTED });
  }
  return options;
}
