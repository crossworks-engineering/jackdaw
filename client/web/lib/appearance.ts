// Server-module only (fetches the request's brain; imported by the root
// layout, a Server Component). Do not import from client components.
import type { BrainAppearance } from '@mantle/web-ui/appearance';
import { brainOrigin } from './brain-origin';

/**
 * Server-side loader for the brain's system-wide appearance (colour theme,
 * display fonts, avatar style), fetched from the server tier's public GET /api/appearance.
 * The root layout awaits this and renders the values straight into the
 * `<html>` tag — the ONLY delivery path; there are no before-paint scripts and
 * no localStorage cache (see @mantle/web-ui/appearance).
 *
 * In-process cache: this sits on the critical path of every SSR. Successes
 * cache 30s so an admin's change shows up promptly; failures cache 5s
 * (keeping any last-known-good value) so an unreachable server tier costs ONE
 * 2s timeout per window, not a 2s render stall on every request. A page must
 * never fail to render over branding — every failure path returns a value.
 *
 * Cached PER BRAIN: the desktop shell's one embedded server renders for every
 * brain it knows (lib/brain-origin.ts), and one shared slot would hand a
 * window whichever brain was asked last.
 */
const TTL_OK_MS = 30_000;
const TTL_FAIL_MS = 5_000;
type Entry = { at: number; ok: boolean; value: BrainAppearance | null };
const cache = new Map<string, Entry>();

export async function loadBrainAppearance(): Promise<BrainAppearance | null> {
  const origin = await brainOrigin();
  if (!origin) return null; // unset (build, misconfig) — render the defaults
  const now = Date.now();
  let cached = cache.get(origin);
  if (cached && now - cached.at < (cached.ok ? TTL_OK_MS : TTL_FAIL_MS)) return cached.value;
  try {
    const res = await fetch(`${origin}/api/appearance`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      cached = { at: now, ok: false, value: cached?.value ?? null };
      cache.set(origin, cached);
      return cached.value;
    }
    const value = (await res.json()) as BrainAppearance;
    cache.set(origin, { at: now, ok: true, value });
    return value;
  } catch {
    cached = { at: now, ok: false, value: cached?.value ?? null };
    cache.set(origin, cached);
    return cached.value;
  }
}
