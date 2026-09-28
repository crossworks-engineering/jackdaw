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
    './keep-private-field.tsx',
    '../../lib/admin-private.ts',
  ])('%s names none of them', (file) => {
    const text = src(file);
    for (const needle of MEMBER_ONLY) expect(text, needle).not.toContain(needle);
  });

  it('the private workspace opens items under the admin client only', () => {
    const text = src('./admin-private-workspace.tsx');
    expect(text).toMatch(/<SpaceApiProvider client=\{adminSpace\}>\s*<MineItem/);
    expect(text).toContain('adminSpace.listPath(');
  });

  it('MineItem shows sharing, review and the discussion to a member only', () => {
    const text = src('./mine-item.tsx');
    // Each member-only control sits behind the admin check, on its own line.
    expect(text).toMatch(/\{admin \? null : <SharingControl row=\{row\} \/>\}/);
    expect(text).toMatch(/\{!admin && commentsOpen\(row\) \? <SpaceComments/);
    expect(text).toMatch(/\) : \(\s*<ReviewActions row=\{row\} beforeSubmit=\{beforeSubmit\} \/>/);
    // and the item is read and written through the provided client.
    expect(text).toContain('replayRescue(id, Date.now(), api.base)');
    expect(text).not.toContain('memberSpace');
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
    expect(text).toContain('mapAssetPath={admin ? undefined : memberAssetPath}');
    expect(text).toContain('admin ? `/api/draws/${row.id}/svg` : memberDrawUrlPath(row.id)');
    expect(text).toContain('admin ? api.bytesPath(row.id) : bytesPath(source, row.id)');
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
    'the %s screen mounts the private view for an admin only',
    (dir) => {
      const text = src(`../../app/(app)/${dir}/page.tsx`);
      expect(text).toMatch(
        /<RoleSwitch member=\{<MemberWorkspace kind="\w+" \/>\}>\s*<AdminSpaces/,
      );
    },
  );
});
