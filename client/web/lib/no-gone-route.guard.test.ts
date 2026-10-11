import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nothing calls a route a W6b brain answers 410 (contract item 1): the
 * personal spaces are folded into the brain, and every login uses the owner
 * routes in its own scope. The member space, its files, the member's own
 * apps and trash, the member items list and the member tree are gone, and so
 * are the admin's private space and its files.
 *
 * Every source file of the app, the UI kit, the desktop shell and the e2e
 * specs is scanned for a quoted path (or a quoted route base that such a path
 * was built on). Paths are the repo's.
 */
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ROOTS = ['client/web/', 'packages/web-ui/src/', 'client/desktop/src/', 'e2e/'];
const SELF = 'client/web/lib/no-gone-route.guard.test.ts';

/** The 410 routes of the W6b contract, as a quoted path starts. */
export const GONE_ROUTES: [string, RegExp][] = [
  ['/api/member/space (and its items, drafts, saves and bytes)', /['"`]\/api\/member\/space\b/],
  ['/api/member/space-files', /['"`]\/api\/member\/space-files\b/],
  ['/api/member/my-apps (and its trash, history and share)', /['"`]\/api\/member\/my-apps\b/],
  ['/api/member/items', /['"`]\/api\/member\/items\b/],
  ['/api/member/tree (and its search, move and folders)', /['"`]\/api\/member\/tree\b/],
  ['/api/admin/space (and its items, drafts, saves and bytes)', /['"`]\/api\/admin\/space\b/],
  ['/api/admin/space-files', /['"`]\/api\/admin\/space-files\b/],
  // A route base the paths above were built on ('/api/member' + '/space').
  ['a bare /api/member or /api/admin base', /['"`]\/api\/(member|admin)\/?['"`]/],
];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(relative(REPO, path).split(sep).join('/'));
  }
  return out;
}

const scanned = ROOTS.flatMap((r) => sources(join(REPO, r))).filter((f) => f !== SELF);

describe('no call to a route a W6b brain answers 410', () => {
  it('scans the app, the UI kit, the desktop shell and the e2e specs', () => {
    for (const f of [
      'client/web/components/item-tree/tree-api.ts',
      'client/web/lib/member-apps.ts',
      'client/web/components/member/member-home.tsx',
      'client/web/app/(app)/pages/pages-client.tsx',
      'client/web/app/(app)/apps/apps-client.tsx',
      'packages/web-ui/src/api-fetch.ts',
      'e2e/workspace/member-shell.spec.ts',
    ]) {
      expect(scanned).toContain(f);
    }
  });

  it.each(GONE_ROUTES)('no file names %s', (_name, needle) => {
    const hits = scanned.filter((f) => needle.test(readFileSync(join(REPO, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the needles catch what they are for', () => {
    const caught = (src: string) => GONE_ROUTES.some(([, re]) => re.test(src));
    expect(caught("apiFetch('/api/member/space?page=1')")).toBe(true);
    expect(caught('`/api/member/tree/${kind}/search`')).toBe(true);
    expect(caught("'/api/admin/space/' + id")).toBe(true);
    expect(caught("const BASE = '/api/member';")).toBe(true);
    expect(caught("apiFetch('/api/member/apps')")).toBe(false);
    expect(caught("apiFetch('/api/member/home')")).toBe(false);
    expect(caught('`/api/member/files/${id}`')).toBe(false);
  });
});
