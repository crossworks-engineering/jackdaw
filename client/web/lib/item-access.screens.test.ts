import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The item caps (workspaces W6b fix round): each item screen asks itemAccess
 * about the item it loaded, and shows readOnlyNote for an item the login may
 * read but not change (a snapshot copy, or no mayEdit). The behaviour is in
 * item-access.test.ts; this pins that the screens use it, and that none
 * still reads the copy mark alone.
 */
const SCREENS = [
  'app/(app)/pages/pages-client.tsx',
  'app/(app)/pages/[id]/page-detail-client.tsx',
  'app/(app)/notes/notes-client.tsx',
  'app/(app)/draw/draws-client.tsx',
  'app/(app)/draw/[id]/draw-detail-client.tsx',
  'app/(app)/tables/[id]/table-detail-client.tsx',
  'app/(app)/files/file-editor.tsx',
] as const;

/** The lists whose rows and tree menus offer Delete (or Rename) per item. */
const LISTS = [
  'app/(app)/pages/pages-client.tsx',
  'app/(app)/notes/notes-client.tsx',
  'app/(app)/draw/draws-client.tsx',
  'app/(app)/tables/tables-shell.tsx',
  'app/(app)/files/files-client.tsx',
  'app/(app)/apps/apps-client.tsx',
] as const;

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the item screens read the caps', () => {
  it.each(SCREENS)('%s asks itemAccess and shows the read-only note', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/lib/item-access'");
    expect(src).toContain('itemAccess(');
    expect(src).toContain('readOnlyNote(');
    // The copy mark alone is not the rule any more: mayEdit and mayManage
    // decide too.
    expect(src).not.toContain('isReadOnlyItem(');
  });

  it.each(LISTS)('%s asks itemAccess before it offers Delete', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/lib/item-access'");
    expect(src).toMatch(/itemAccess\([a-z]+\)\.manage/);
  });
});
