'use client';

import type { JSONContent } from '@tiptap/core';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { PageView } from '@/components/page-editor/page-view';
import { memberAssetPath, memberDrawUrlPath } from '@/lib/member-assets';
import { clientAssetPath } from '@/lib/client-portal';
import { bytesPath, isAdminSpace, isClientSpace, type SpaceItem } from '@/lib/member-space';
import { spaceViewHere } from '@/lib/member-folder-index';
import { useReaderTreeServes } from '@/components/item-tree/use-tree-kinds';
import { useSpaceApi } from './space-api';

/**
 * A personal item, read-only: a teammate's shared item (its SAVED version,
 * the brain never sends a teammate the draft), or an own item that is frozen
 * for review. The same presenters the Library reader and share links use.
 */
export function SpaceItemView({
  source,
  item,
  working = false,
  fileBytesPath,
  noFolder = false,
}: {
  source: 'mine' | 'team';
  item: SpaceItem;
  /** Where a file's bytes stream from, where it is not the item's own
   *  space route (a client request a member reads, client logins C5). */
  fileBytesPath?: string;
  /** Own items: a page or a table shows its working copy (the draft, when
   *  there is one). A drawing always shows its saved SVG and a note has no
   *  draft, so for those two this changes nothing. */
  working?: boolean;
  /** The page is in no folder a tree lists (a client wrote it): a Folder
   *  index block set to `here` shows its label alone. */
  noFolder?: boolean;
}) {
  const asset = useAssetUrl();
  const api = useSpaceApi();
  // An admin's private item reads its bytes from the admin routes, and the
  // brain items it embeds from their own (owner) routes, never the member ones.
  const admin = isAdminSpace(api);
  // A client's own item reads its bytes from the client routes (C5).
  const client = isClientSpace(api);
  const treeServesPages = useReaderTreeServes('member', 'pages');
  const { row, body } = item;
  switch (body.type) {
    case 'page': {
      const doc = (working ? (body.page.draft ?? body.page.doc) : body.page.doc) as JSONContent;
      // The folder the page sits in (folder phase 7), for a Folder index
      // block set to `here`: only where a member's tree can list it
      // (lib/member-folder-index.ts). Absent from a brain before the pages tree.
      const here = spaceViewHere({
        space: admin ? 'admin' : client ? 'client' : 'member',
        source,
        treeServesPages,
        folderId: (body.page as { folderId?: string | null }).folderId,
        noFolder,
      });
      return (
        <PageView
          content={doc}
          mapAssetPath={admin ? undefined : client ? clientAssetPath : memberAssetPath}
          folderId={here.folderId}
          quietHere={here.quietHere}
        />
      );
    }
    case 'note':
      return (
        <NotePresenter view={{ title: row.title, content: body.note.content }} chrome="embedded" />
      );
    case 'draw':
      return (
        <DrawPresenter
          view={{ title: row.title, hasSvg: true }}
          src={asset(admin ? `/api/draws/${row.id}/svg` : memberDrawUrlPath(row.id))}
          chrome="embedded"
        />
      );
    case 'table': {
      const t = body.table;
      const doc = working ? (t.draft ?? t.data) : t.data;
      return (
        <TablePresenter
          view={{ title: row.title, icon: row.icon, tabs: null, legacyDoc: doc }}
          token=""
          chrome="embedded"
        />
      );
    }
    case 'file':
      return (
        <FilePresenter
          view={{
            fileId: row.id,
            filename: body.file.filename,
            mimeType: body.file.mimeType,
            size: body.file.sizeBytes,
          }}
          assetUrl={() =>
            asset(
              fileBytesPath ??
                (admin || client ? api.bytesPath(row.id) : bytesPath(source, row.id)),
            )
          }
          chrome="embedded"
        />
      );
  }
}
