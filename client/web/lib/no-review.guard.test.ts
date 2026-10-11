import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * No review UI in the owner screens (W5c): workspaces replace review. There
 * is no submit, no waiting for approval, no Approve, Reject, Take over or
 * Discard of a submitted item, no "Shared by members" and no member app
 * review. Items are shared by grants to workspaces (the Grant Access panel).
 *
 * The scan skips what other W5c parts still own (the member and client
 * shells, Team admin, Users, the sign-in pages), and the few files kept only
 * because those still import them. Each part that lands takes its paths out
 * of these lists; when all have landed, both lists are empty.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Owned by another W5c part (the shell, Team admin and Users helpers). */
const OTHER_PARTS = [
  'components/member/',
  'components/client/',
  'components/team-admin/',
  'components/team-chat/',
  'components/layout/rail/',
  'app/(app)/team-admin/',
  'app/(app)/settings/users/',
  'app/client-signin/',
  'app/login/',
  'app/invite/',
  'lib/member-',
  'middleware',
];

/** Kept ONLY for files the other parts own (each says who in its header). */
const KEPT_FOR_OTHER_PARTS = [
  'components/review/item-review.tsx',
  'components/review/review-dialogs.tsx',
  'components/review/review-redirect.tsx',
  'components/review/workspace-review-sections.tsx',
  'components/app-nav/member-apps-review.tsx',
  'lib/workspace-review.ts',
  'lib/workspace-review.test.ts',
  'lib/review-no-note.ts',
];

/** The review UI's words, its components and its routes. */
const NEEDLES: [string, RegExp][] = [
  ['Waiting for approval', /Waiting for approval/],
  ['Shared by members', /Shared by members/],
  ['Take over', /Take over/],
  ['ItemReview', /\bItemReview(Sections)?\b/],
  ['ReviewSections', /\b(Workspace|MemberApps)?ReviewSections\b/],
  ['MemberAppReview', /\bMemberAppReview\b/],
  ['useReviewOpen', /\buseReviewOpen\b/],
  ['the /review route', /['"`]\/review\b|\/apps\/review\b/],
  ['a ?review= selection', /[?&]review=/],
  ['the shared member items route', /\/api\/team-admin\/member-items/],
  ['the send-back route', /\/send-back\b/],
  ['the take-over route', /\/take-over\b/],
];

const SELF = 'lib/no-review.guard.test.ts';

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, path).split(sep).join('/'));
  }
  return out;
}

const scanned = sources(ROOT).filter(
  (f) =>
    f !== SELF && !OTHER_PARTS.some((p) => f.startsWith(p)) && !KEPT_FOR_OTHER_PARTS.includes(f),
);

describe('no review UI in the owner screens (W5c)', () => {
  it('scans the owner screens', () => {
    for (const f of [
      'app/(app)/pages/pages-client.tsx',
      'app/(app)/notes/notes-client.tsx',
      'app/(app)/files/files-client.tsx',
      'app/(app)/draw/draws-client.tsx',
      'app/(app)/tables/tables-shell.tsx',
      'app/(app)/apps/apps-client.tsx',
      'components/item-list/admin-private-rows.tsx',
      'lib/needs-you.ts',
    ]) {
      expect(scanned).toContain(f);
    }
  });

  it.each(NEEDLES)('no file names %s', (_name, needle) => {
    const hits = scanned.filter((f) => needle.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the review screens and the member app review are gone', () => {
    for (const gone of [
      'app/(app)/review',
      'app/(app)/apps/review',
      'components/app-nav/member-app-review.tsx',
      'components/app-nav/member-app-activity.tsx',
    ]) {
      expect(existsSync(join(ROOT, gone)), gone).toBe(false);
    }
  });

  it('the kept files are still there, so this list stays honest', () => {
    for (const f of KEPT_FOR_OTHER_PARTS) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });
});
