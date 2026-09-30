'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { FolderIndexList } from './folder-index-list';

/**
 * The editor's face for a `folderIndex` block: the live list, with `here`
 * (a null `folderId`) read from the SlashCommand extension's storage, which
 * carries the folder the page being edited sits in.
 */
export function FolderIndexView({ node, editor }: NodeViewProps) {
  const folderId = typeof node.attrs.folderId === 'string' ? node.attrs.folderId : null;
  const storage = editor.storage as unknown as Record<
    string,
    { folderId?: string | null } | undefined
  >;
  const here = storage.slashCommand ? (storage.slashCommand.folderId ?? null) : undefined;
  return (
    <NodeViewWrapper className="my-2" data-drag-handle>
      <FolderIndexList folderId={folderId} hereFolderId={here} />
    </NodeViewWrapper>
  );
}
