/**
 * Is what someone typed as a brain address the same brain as `origin`?
 *
 * Only decides what the add-login form SHOWS (a password field, or "open that
 * brain"). The desktop shell normalises the address itself and is the judge of
 * what it actually opens, so this errs toward "different": anything it cannot
 * parse is not this brain, and the shell then says what is wrong with it.
 *
 * Forgiving in the ways people type addresses: surrounding space, a trailing
 * slash or path, letter case in the host, and a missing scheme (https, the
 * same default the shell applies).
 */
export function sameBrainAddress(typed: string, origin: string): boolean {
  const a = originOf(typed);
  const b = originOf(origin);
  return a !== null && a === b;
}

function originOf(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}
