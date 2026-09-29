import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * An admin's private space (member logins Phase 7) never calls a member-only
 * route: no share, submit, recall, comments or realtime, and nothing under
 * /api/member at all. The client object is pinned in lib/space-client.test.ts;
 * this pins the screens, which the node test runner cannot render.
 */
const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** What reaches another person, or the member routes at all. */
const MEMBER_ONLY = [
  '/api/member',
  'memberSpace',
  'apiEventStream',
  'realtime',
  'SharingControl',
  'ReviewActions',
  'SpaceComments',
  '.share(',
  '.submit(',
  '.recall(',
  'Comment(',
];

describe('the admin private screens never reach a member-only route', () => {
  it.each([
    './admin-private-workspace.tsx',
    '../item-list/admin-private-rows.tsx',
    './keep-private-field.tsx',
    './give-back-dialog.tsx',
    '../../lib/admin-private.ts',
  ])('%s names none of them', (file) => {
    const text = src(file);
    for (const needle of MEMBER_ONLY) expect(text, needle).not.toContain(needle);
  });

  it('a private item in an owner list opens under the admin client only', () => {
    const text = src('../item-list/admin-private-rows.tsx');
    expect(text).toMatch(/<SpaceApiProvider client=\{adminSpace\}>\s*<MineItem/);
  });

  // MineItem's own rule (sharing, review and the discussion for a member
  // only, Give back for a taken item) is pinned by behaviour now, not by its
  // source text (client logins C5 audit U12): e2e/member/admin-takeover
  // (a private item asks no member route and shows none of them),
  // member-takeover (a member's own item has them) and client-requests (a
  // client's has no sharing).
  it('MineItem reads and writes through the provided client only', () => {
    const text = src('./mine-item.tsx');
    expect(text).not.toContain('memberSpace');
    expect(text).not.toContain('/api/member');
  });

  it.each([
    './mine-page-editor.tsx',
    './mine-note-editor.tsx',
    './member-draw-editor.tsx',
    './member-table-editor.tsx',
  ])('%s writes through the provided client, not the member one', (file) => {
    const text = src(file);
    expect(text).toContain('useSpaceApi()');
    expect(text).not.toContain('memberSpace');
    expect(text).not.toContain('/api/member');
  });

  it("a private item's read-only view reads admin and owner routes", () => {
    const text = src('./space-item-view.tsx');
    // (A client's own item reads the client routes: client logins C5.)
    expect(text).toContain(
      'mapAssetPath={admin ? undefined : client ? clientAssetPath : memberAssetPath}',
    );
    expect(text).toContain('admin ? `/api/draws/${row.id}/svg` : memberDrawUrlPath(row.id)');
    expect(text).toContain('admin || client ? api.bytesPath(row.id) : bytesPath(source, row.id)');
  });
});

describe('each owner create flow routes Keep private into the private space', () => {
  it.each([
    ['../../app/(app)/pages/pages-client.tsx', "createPrivateItem('page'"],
    ['../../app/(app)/notes/note-editor.tsx', "createPrivateItem('note'"],
    ['../../app/(app)/draw/draws-client.tsx', "createPrivateItem('draw'"],
    ['../../app/(app)/tables/tables-shell.tsx', "createPrivateItem('table'"],
    ['../../app/(app)/files/files-dialogs.tsx', 'uploadPrivateFile(privateTextFile('],
    ['../../app/(app)/files/files-client.tsx', 'uploadPrivateFile(f)'],
  ])('%s', (file, call) => {
    const text = src(file);
    expect(text).toContain(call);
    expect(text).not.toContain('/api/member');
  });

  it.each([
    '../../app/(app)/pages/pages-client.tsx',
    '../../app/(app)/notes/note-editor.tsx',
    '../../app/(app)/draw/draws-client.tsx',
    '../../app/(app)/tables/tables-shell.tsx',
    '../../app/(app)/files/files-dialogs.tsx',
  ])('%s offers the switch, off by default', (file) => {
    const text = src(file);
    expect(text).toContain('<KeepPrivateField checked={keepPrivate}');
    expect(text).toMatch(/const \[keepPrivate, setKeepPrivate\] = useState\(false\)/);
  });

  it.each(['pages', 'notes', 'draw', 'tables', 'files'])(
    'the %s screen keeps old Private-view links working, for an admin only',
    (dir) => {
      const text = src(`../../app/(app)/${dir}/page.tsx`);
      expect(text).toMatch(
        /<RoleSwitch member=\{<MemberWorkspace kind="\w+" \/>\}>\s*<AdminSpaces/,
      );
    },
  );
});
