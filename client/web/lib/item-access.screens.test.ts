import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A snapshot copy is read only (workspaces W6b): each item screen asks
 * isReadOnlyItem about the item it loaded, and shows SNAPSHOT_COPY_NOTE for
 * it. The behaviour is in item-access.test.ts; this pins that the screens
 * use it.
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

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('the item screens read a snapshot copy as read only', () => {
  it.each(SCREENS)('%s asks isReadOnlyItem and shows the note', (rel) => {
    const src = read(rel);
    expect(src).toContain("from '@/lib/item-access'");
    expect(src).toContain('isReadOnlyItem(');
    expect(src).toContain('{SNAPSHOT_COPY_NOTE}');
  });
});
