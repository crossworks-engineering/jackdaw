import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Team codes are gone (member logins Phase 6, brain migration 0178 drops
 * `contact_team_tokens`): only a 16-character invite code redeems, on /invite
 * as everywhere. The Team admin tab that listed code holders now lists every
 * contact with old portal chat (Chat archive), and the brain no longer
 * answers `tokenLastUsedAt` (it was always null). So no screen may offer a
 * team code, name code holders, or show when a code was last used.
 *
 * Discovered, not declared: every non-test .ts/.tsx file under client/web and
 * packages is read with its comments stripped (a comment may tell the
 * history), so a new screen that brings the copy back fails here.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = ['client/web', 'packages'];
const SKIP = new Set(['node_modules', '.next', 'dist', 'out']);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Block comments (JSX ones too) and line comments out; a `//` right after a
 *  colon is a URL, not a comment. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FILES = ROOTS.flatMap((r) => sources(join(REPO, r))).map((path) => ({
  path: relative(REPO, path),
  text: code(readFileSync(path, 'utf8')),
}));

const hits = (re: RegExp) => FILES.filter((f) => re.test(f.text)).map((f) => f.path);

describe('retired team codes', () => {
  it('scans the client (the control)', () => {
    const page = FILES.find((f) => f.path.endsWith('app/(app)/team-admin/page.tsx'));
    expect(page?.text).toMatch(/'Requests'/);
    expect(FILES.some((f) => f.path.endsWith('app/invite/invite-client.tsx'))).toBe(true);
  });

  it('never offers or mentions a team code', () => {
    expect(hits(/team[- ]code/i)).toEqual([]);
  });

  it('never names code holders', () => {
    expect(hits(/code[- ]holders?/i)).toEqual([]);
  });

  it('never shows when a code was last used', () => {
    expect(hits(/\btokenLastUsedAt\b/)).toEqual([]);
    expect(hits(/code last used/i)).toEqual([]);
  });
});
