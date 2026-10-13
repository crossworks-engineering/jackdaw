import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sharesPrefKey } from './item-tree';
import { pillsUnderName, rowEstimate } from './tree-rows';
import type { TreeRow } from './tree-model';

/**
 * The share marks of the tree (task ca907a89): a toggle left of the filter
 * button shows or hides the share pills, remembered per login in this
 * browser and hidden by default; hidden, each workspace's icon sits beside
 * the name; shown, the pills sit under it. One component draws them for
 * folders and items of every kind (TreeName), no kind its own copy. The node
 * runner cannot mount the tree, so the wiring is pinned by reading it, as
 * tree-view.test.ts does.
 */
const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const tree = read('./item-tree.tsx');
const rows = read('./tree-rows.tsx');

const withLook = { workspaces: [{ id: 'w', name: 'Team', kind: 'team' }], hasLink: false };
const olderBrain = { workspaces: [{ id: 'w', name: 'Team' }], hasLink: false };
const none = { workspaces: [], hasLink: false };

describe('the share marks toggle', () => {
  it('sits left of the filter button: one name, aria-pressed says the state (audit L5)', () => {
    const toggle = tree.indexOf('aria-label="Show shares"');
    const filter = tree.indexOf('<DropdownMenu open={filterMenuOpen}');
    expect(toggle).toBeGreaterThan(0);
    expect(toggle).toBeLessThan(filter);
    expect(tree).toContain('aria-pressed={showShares}');
    expect(tree).not.toContain('Hide shares');
  });

  it('is remembered per login, hidden by default; nothing kept before the login is known (L3)', () => {
    expect(tree).toContain(
      'usePersistedState<boolean>( sharesPrefKey(login), false, parseFlag, serialiseFlag, )',
    );
    expect(sharesPrefKey('Ann@X.test')).toBe('mantle_tree_shares_v1:ann@x.test');
    expect(sharesPrefKey(null)).toBeNull();
    expect(sharesPrefKey('  ')).toBeNull();
  });

  it('reaches every row through the tree context, and the list through its estimate', () => {
    expect(tree).toMatch(/dragging, showShares, };/);
    expect(tree).toContain('render={renderRow} showShares={showShares}');
  });
});

describe('one share marks component', () => {
  it('folder rows, item rows and folder hits draw TreeName', () => {
    expect(rows.match(/<TreeName name=/g)).toHaveLength(3);
    expect(rows).not.toContain('ShareGlyph');
  });

  it('hidden: icons beside the name; shown: pills under it, the row two lines high', () => {
    expect(rows).toContain('<WorkspaceChips item={marks} variant="icons" />');
    expect(rows).toContain('flex min-w-0 flex-1 flex-col');
    expect(pillsUnderName(true, withLook)).toBe(true);
    expect(pillsUnderName(false, withLook)).toBe(false);
    expect(pillsUnderName(true, none)).toBe(false);
  });

  it('an older brain (chips with no look) shows named pills, never grey tiles (L4)', () => {
    expect(pillsUnderName(false, olderBrain)).toBe(true);
  });

  it('a row with pills is first taken to be two lines high (L6)', () => {
    const item = { type: 'item', key: 'i', item: withLook } as unknown as TreeRow;
    const folder = { type: 'folder', key: 'f', folder: withLook } as unknown as TreeRow;
    expect(rowEstimate(item, false)).toBe(33);
    expect(rowEstimate(item, true)).toBe(47);
    expect(rowEstimate(folder, true)).toBe(47);
    expect(rowEstimate({ type: 'divider', key: 'd' } as TreeRow, true)).toBe(9);
  });

  it('no kind draws the share marks itself', () => {
    for (const f of ['./kinds/simple.tsx', './kinds/files.tsx', './kinds/apps.tsx']) {
      expect(read(f), f).not.toContain('WorkspaceChips');
    }
  });
});
