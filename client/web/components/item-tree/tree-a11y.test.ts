import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rowTabIndex } from './tree-context';

/**
 * The item tree as a keyboard and a screen reader meet it (folder audit
 * UI-05, UI-09). The node runner cannot render the rows, so the wiring is
 * pinned by reading them; the tab stop rule is pure.
 */
const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const rows = read('./tree-rows.tsx');
const tree = read('./item-tree.tsx');

describe('the roving tab stop', () => {
  it('lets Tab reach one row of a tree that has a stop', () => {
    expect(rowTabIndex({ tabStop: 'f:a' }, 'f:a')).toBe(0);
    expect(rowTabIndex({ tabStop: 'f:a' }, 'i:b')).toBe(-1);
    expect(rowTabIndex({ tabStop: null }, 'i:b')).toBe(-1);
  });
  it('leaves every row a tab stop where the tree keeps none (the picker)', () => {
    expect(rowTabIndex({}, 'f:a')).toBeUndefined();
  });
});

describe('the rows are a tree', () => {
  it('the list is a tree and every row a treeitem with its level', () => {
    expect(tree).toContain('role="tree"');
    expect(rows.match(/role="treeitem"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rows).toContain('aria-level={depth + 1}');
    expect(rows).toContain('aria-expanded={hasChildren ? open : undefined}');
    expect(rows).toContain('aria-selected={selected || picked}');
  });

  it('the arrow keys move the tab stop, and it is always drawn', () => {
    expect(tree).toContain("if (e.key === 'ArrowDown') go(navRows[at + 1]);");
    expect(tree).toContain("else if (e.key === 'ArrowUp') go(navRows[at - 1]);");
    expect(tree).toContain("else if (e.key === 'ArrowRight') {");
    expect(tree).toContain("else if (e.key === 'ArrowLeft') {");
    expect(tree).toContain('keepKey={tabStop}');
  });

  it('names each menu button after its row, and shows it where nothing hovers', () => {
    expect(rows).toContain("aria-label={label ? `More actions for ${label}` : 'More actions'}");
    expect(rows).toContain('label={folder.name}');
    expect(rows).toContain("label={item.title || 'Untitled'}");
    expect(rows).toContain('[@media(hover:none)]:opacity-100');
    expect(rows).toContain('group-focus-within/tree-row:opacity-100');
    // 24px to look at, 32px to hit.
    expect(rows).toContain('after:-inset-1');
  });
});
