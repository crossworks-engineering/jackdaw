import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sharesPrefKey } from './item-tree';

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

describe('the share marks toggle', () => {
  it('sits left of the filter button, and is a pressed toggle', () => {
    const toggle = tree.indexOf("aria-label={showShares ? 'Hide shares' : 'Show shares'}");
    const filter = tree.indexOf('<DropdownMenu open={filterMenuOpen}');
    expect(toggle).toBeGreaterThan(0);
    expect(toggle).toBeLessThan(filter);
    expect(tree).toContain('aria-pressed={showShares}');
  });

  it('is remembered per login, hidden by default', () => {
    expect(tree).toContain(
      'usePersistedState<boolean>( sharesPrefKey(login), false, parseFlag, serialiseFlag, )',
    );
    expect(sharesPrefKey('Ann@X.test')).toBe('mantle_tree_shares_v1:ann@x.test');
    expect(sharesPrefKey(null)).toBe('mantle_tree_shares_v1:me');
  });

  it('reaches every row through the tree context', () => {
    expect(tree).toMatch(/dragging, showShares, };/);
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
    expect(rows).toContain("return !!showShares && hasShareMarks(marks) && 'h-auto min-h-8';");
  });

  it('no kind draws the share marks itself', () => {
    for (const f of ['./kinds/simple.tsx', './kinds/files.tsx', './kinds/apps.tsx']) {
      expect(read(f), f).not.toContain('WorkspaceChips');
    }
  });
});
