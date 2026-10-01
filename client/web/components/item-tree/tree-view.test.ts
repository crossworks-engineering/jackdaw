import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every tree opens on Folders (Jason, 2026-10-01). The view is plain state
 * of the tree, so a mount (the screen is opened) starts on Folders and the
 * choice of Recent, Most used or A to Z lasts only while the tree stays
 * mounted. The node runner cannot mount the tree, so the wiring is pinned by
 * reading it, as tree-a11y.test.ts does; a real remount is checked in a
 * browser.
 */
const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
const tree = read('./item-tree.tsx');
const member = read('../member/member-workspace.tsx');
const client = read('../client/client-home.tsx');

describe('the view a tree opens on', () => {
  it('a mount starts on Folders: the view is plain state, with no stored value to adopt', () => {
    expect(tree).toContain("const [chosenView, setView] = useState<View>('tree');");
    // The old per-scope key is gone, read and write: nothing can put a
    // remounted tree back on Recent.
    expect(tree).not.toContain('mantle_tree_view');
    expect(tree.match(/usePersistedState</g)).toHaveLength(1);
  });

  it('the sort and the open folders are still remembered', () => {
    expect(tree).toContain('usePersistedState<TreeSort>( `mantle_tree_sort_v1:${scope}`,');
    expect(tree).toContain('const key = `mantle_tree_open_v1:${scope}`;');
  });

  it('a reader is never left on a view it does not have', () => {
    expect(tree).toContain(
      "const view: View = views.some((v) => v.id === chosenView) ? chosenView : 'tree';",
    );
  });

  it('a folder search hit still goes back to Folders', () => {
    expect(tree).toContain(
      "const openFolderHit = (folder: TreeFolder) => { onQueryChange(''); setView('tree');",
    );
  });

  it('nothing but a click on a view, or a folder hit, changes the view', () => {
    // Two callers in all: the chips and openFolderHit. A selection, a
    // refetch and a cleared search never touch it.
    expect(tree.match(/setView\(/g)).toHaveLength(2);
    expect(tree).toContain('setView(v as View);');
  });
});

describe('a phone keeps the tree mounted while an item is open', () => {
  // Below md the member and client screens show the list OR the detail. The
  // list is hidden, not unmounted, so opening an item and closing it is not
  // a new visit: the chosen view holds.
  it('the member workspace hides its list behind the open item', () => {
    expect(member).toContain(
      "<div className={openId ? 'hidden' : 'h-full min-h-0'}>{treePane ?? listPane}</div> {openId ? detailPane : null}",
    );
  });

  it('the client home hides its list behind the open item', () => {
    expect(client).toContain(
      "<div className={selectedId ? 'hidden' : 'h-full min-h-0'}>{treePane ?? listPane}</div> {selectedId ? detailPane : null}",
    );
  });
});
