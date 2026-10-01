import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * MinePageEditor's Folder index wiring, where the node test runner cannot
 * render it: the rule is unit-tested in lib/member-folder-index.test.ts and
 * the slash list in page-editor/slash-menu.test.ts.
 */
const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const editor = src('./mine-page-editor.tsx');

describe("a member's draft editor and the Folder index", () => {
  it("hands PageEditor the draft's folder and the gate, from the shared rule", () => {
    expect(editor).toContain('folderId={folder.folderId}');
    expect(editor).toContain('folderIndex={folder.folderIndex}');
    expect(editor).toMatch(
      /const folder = memberFolderIndex\(\{\s*space: admin \? 'admin' : client \? 'client' : 'member',\s*treeServesPages,\s*folderId: page\.folderId,\s*\}\);/,
    );
  });

  it("asks the MEMBER shell whether the tree serves pages, never the owner's", () => {
    expect(editor).toContain("const treeServesPages = useReaderTreeServes('member', 'pages');");
    expect(editor).not.toContain('useTreeServes(');
  });

  it('never collapses an unknown folder to the top level', () => {
    // `page.folderId` goes in as it came: no `?? null`, no `|| null`.
    expect(editor).not.toMatch(/folderId\s*(\?\?|\|\|)\s*null/);
    expect(editor).toContain('folderId?: string | null');
  });

  it('MineItem hands the editor the page body whole, folder and all', () => {
    expect(src('./mine-item.tsx')).toContain(
      '<MinePageEditor {...editorProps} page={body.page} />',
    );
  });
});
