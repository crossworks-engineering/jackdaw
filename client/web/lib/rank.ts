/**
 * Fractional ordering keys for the task board — client mirror of the server's
 * packages/content/src/rank.ts (mantle repo). Same base-36 midpoint algorithm,
 * so a key computed here sorts identically server-side. A drag writes ONE row
 * (`PATCH {status, rank}`), never a renumber.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

export const RANK_RE = /^[0-9a-z]{1,64}$/;

/** A key strictly between `after` and `before` (null/undefined = open end). */
export function rankBetween(after?: string | null, before?: string | null): string {
  const lo = after ?? '';
  let hi = before ?? '';
  if (lo && !RANK_RE.test(lo)) throw new Error(`rankBetween: bad lower bound '${lo}'`);
  if (hi && !RANK_RE.test(hi)) throw new Error(`rankBetween: bad upper bound '${hi}'`);
  if (hi && lo >= hi) {
    throw new Error(`rankBetween: lower bound '${lo}' must sort before upper bound '${hi}'`);
  }
  let out = '';
  for (let i = 0; ; i++) {
    const da = i < lo.length ? DIGITS.indexOf(lo.charAt(i)) : 0;
    const db = hi && i < hi.length ? DIGITS.indexOf(hi.charAt(i)) : BASE;
    if (da === db) {
      out += DIGITS.charAt(da);
      continue;
    }
    if (db - da === 1) {
      out += DIGITS.charAt(da);
      hi = '';
      continue;
    }
    out += DIGITS.charAt(Math.floor((da + db) / 2));
    return out;
  }
}
