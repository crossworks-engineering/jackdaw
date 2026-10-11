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
 * Every W5c part has landed: Team admin, the client sign-in page and the
 * review leftovers are gone, and the Users screen and the sign-in pages are
 * scanned like any other screen.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
  // Routes a W5c brain answers 410: the UI asks none of them.
  ['the review queue route', /['"`]\/api\/team-admin\/submissions/],
  ['the needs-you route', /['"`]\/api\/team-admin\/needs-you/],
  ['the member app review route', /['"`]\/api\/apps\/members/],
  ['the send-back route', /\/send-back\b/],
  ['the take-over route', /\/take-over\b/],
];

const SELF = 'lib/no-review.guard.test.ts';

/** Name a needle on purpose, and are no review UI: the retired-path
 *  redirects (/review goes home), and the member space's own `review`
 *  filter (Mine by state, a kept member route). */
const NAMES_ON_PURPOSE = ['middleware.ts', 'middleware.test.ts', 'lib/member-takeover.test.ts'];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, path).split(sep).join('/'));
  }
  return out;
}

const scanned = sources(ROOT).filter((f) => f !== SELF && !NAMES_ON_PURPOSE.includes(f));

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
      // Users and the sign-in pages (W5c, once the other parts landed).
      'app/(app)/settings/users/users-client.tsx',
      'app/(app)/settings/users/invites.tsx',
      'app/login/login-client.tsx',
      'app/login/email-code-form.tsx',
      'app/invite/invite-client.tsx',
      // The shell's (W5c): the member views, the rail and the member libs.
      'components/member/mine-item.tsx',
      'components/member/member-workspace.tsx',
      'components/member/member-my-apps.tsx',
      'components/layout/rail/profile-menu.tsx',
      'lib/member-space.ts',
    ]) {
      expect(scanned).toContain(f);
    }
  });

  it.each(NEEDLES)('no file names %s', (_name, needle) => {
    const hits = scanned.filter((f) => needle.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the review screens, Team admin and the review leftovers are gone', () => {
    for (const gone of [
      'app/(app)/review',
      'app/(app)/apps/review',
      'app/(app)/team-admin',
      'app/client-signin',
      'components/review',
      'components/team-admin',
      'components/team-chat',
      'components/app-nav/member-app-review.tsx',
      'components/app-nav/member-app-activity.tsx',
      'components/app-nav/member-apps-review.tsx',
      'lib/workspace-review.ts',
      'lib/member-review.ts',
      'lib/needs-you.ts',
    ]) {
      expect(existsSync(join(ROOT, gone)), gone).toBe(false);
    }
  });
});
