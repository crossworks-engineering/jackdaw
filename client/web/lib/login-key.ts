/**
 * Who a loaded shell names, as a key for what this browser keeps per login
 * (the last opened item of each section). A member or a client by its login
 * id, an admin by its own login (the actor's email). Null until the shell has
 * loaded.
 *
 * Also clears the copies the member autosave kept before workspaces W6b
 * (lib/member-rescue.ts, removed with the personal spaces): private drafts at
 * rest in a shared browser that nothing sends any more.
 */
import { shellRoleOf } from './workspaces';

export function loginKeyFor(
  shell: { role?: unknown; loginId?: string | null; email?: string | null } | undefined,
): string | null {
  const role = shellRoleOf(shell);
  if (role === 'admin') return `admin:${shell?.email ?? ''}`;
  if (role === 'member' || role === 'client') {
    return shell?.loginId ? `${role}:${shell.loginId}` : null;
  }
  return null;
}

/** The key prefix of the autosave copies kept before W6b. */
export const OLD_RESCUE_PREFIX = 'mantle_member_rescue:';

type Store = Pick<Storage, 'removeItem' | 'key' | 'length'>;

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Remove every kept copy from before W6b. Never throws. */
export function clearOldRescues(s: Store | null = store()): void {
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(OLD_RESCUE_PREFIX)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    // Blocked storage: nothing kept.
  }
}
