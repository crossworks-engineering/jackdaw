import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FolderIndexView } from './folder-index-view';

/**
 * folderIndex, the Folder index block (folder system phase 7): a live,
 * title-only list of a pages folder's pages, as the reader sees them. Pages
 * do not nest, so this is what sub-page cards used to do for navigation: a
 * folder is just a folder, and a page in it can list it.
 *
 * `folderId` names the folder; null means the folder THIS page sits in (the
 * markdown form is `[Folder index](folder:<id>)` or `folder:here`). Nothing
 * is stored: the list is fetched from the reader's own tree route (owner,
 * member or client) each time the page is shown, so it is always the
 * reader's view. The editor draws it with a NodeView; the read-only
 * StaticDoc fills the empty `div[data-folder-index]` after rendering; the
 * brain's open-link renderer emits an inert label.
 */
export const FolderIndex = Node.create({
  name: 'folderIndex',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      folderId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-folder-id'),
        renderHTML: (attrs) => (attrs.folderId ? { 'data-folder-id': attrs.folderId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-folder-index]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-folder-index': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FolderIndexView);
  },
});
