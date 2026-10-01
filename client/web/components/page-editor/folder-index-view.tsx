'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { FolderIndexList } from './folder-index-list';
import { hereFolderOf, useHereFolder } from './here-folder';

/**
 * The editor's face for a `folderIndex` block: the live list, with `here`
 * (a null `folderId`) the folder the page being edited sits in: the editor's
 * live value (HereFolderProvider, which follows a move), else the one the
 * SlashCommand extension's storage was made with.
 */
export function FolderIndexView({ node, editor }: NodeViewProps) {
  const live = useHereFolder();
  const folderId = typeof node.attrs.folderId === 'string' ? node.attrs.folderId : null;
  const storage = editor.storage as unknown as Record<
    string,
    { folderId?: string | null } | undefined
  >;
  // Undefined when the page's folder is not known (a brain before the pages
  // tree): the list then shows its label alone rather than the root.
  const here = hereFolderOf(live, storage.slashCommand?.folderId);
  return (
    <NodeViewWrapper className="my-2" data-drag-handle>
      <FolderIndexList folderId={folderId} hereFolderId={here} />
    </NodeViewWrapper>
  );
}
