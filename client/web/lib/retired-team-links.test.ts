import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Team links are retired (member logins Phase 6 stage 6, mantle v0.232.297):
 * a share link is only ever public, members read team items by level with
 * their own logins, and a team code can no longer be revoked on its own. The
 * brain answers the old calls with a 404 or a 400 `team-links-retired`, which
 * the owner would only meet as an error toast. So no client source may call
 * them or read what they used to answer.
 *
 * Discovered, not declared: every .ts/.tsx file under client/web and
 * packages is read, so a new screen that brings one back fails here.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const ROOTS = ['client/web', 'packages'];
const SKIP = new Set(['node_modules', '.next', 'dist', 'out']);
const SELF = fileURLToPath(import.meta.url);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && path !== SELF) out.push(path);
  }
  return out;
}

const FILES = ROOTS.flatMap((r) => sources(join(REPO, r))).map((path) => ({
  path: relative(REPO, path),
  text: readFileSync(path, 'utf8'),
}));

const hits = (re: RegExp) => FILES.filter((f) => re.test(f.text)).map((f) => f.path);

describe('retired team links', () => {
  it('scans the client (the control)', () => {
    expect(FILES.some((f) => f.path.endsWith('components/share/shared-links-panel.tsx'))).toBe(
      true,
    );
  });

  it('never revokes a team code (POST /api/contacts/:id/team is gone)', () => {
    expect(hits(/\/api\/contacts\/[^'"`\s]*\/team(?![-\w])/)).toEqual([]);
  });

  it('never reads keptTeam from a share DELETE', () => {
    expect(hits(/\bkeptTeam\b/)).toEqual([]);
  });

  it('never shows or asks for a team link mode', () => {
    expect(hits(/\bmode\s*(===|!==|:)\s*'team'/)).toEqual([]);
    expect(hits(/\bTeamPill\b/)).toEqual([]);
  });
});
