'use client';

import type { JSONContent } from '@tiptap/core';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { PageReadWithOutline } from '@/components/page-editor/page-read-with-outline';
import { memberAssetPath, memberDrawUrlPath } from '@/lib/member-assets';
import { noteAssetPath, ownerNoteAssetPath } from '@/lib/note-media';
import { ReaderNote } from './reader-note';
import { isAdminSpace, type SpaceItem } from '@/lib/member-space';
import { spaceViewHere } from '@/lib/member-folder-index';
import { useReaderTreeServes } from '@/components/item-tree/use-tree-kinds';
import { useSpaceApi } from './space-api';

const MEMBER_NOTE_ASSET_PATH = noteAssetPath(memberAssetPath);

/**
 * An own personal item, read-only. The same presenters the Library reader
 * and share links use.
 */
export function SpaceItemView({
  item,
  working = false,
}: {
  item: SpaceItem;
  /** Own items: a page or a table shows its working copy (the draft, when
   *  there is one). A drawing always shows its saved SVG and a note has no
   *  draft, so for those two this changes nothing. */
  working?: boolean;
}) {
  const asset = useAssetUrl();
  const api = useSpaceApi();
  // An admin's private item reads its bytes from the admin routes, and the
  // brain items it embeds from their own (owner) routes, never the member ones.
  const admin = isAdminSpace(api);
  const treeServesPages = useReaderTreeServes('pages');
  const { row, body } = item;
  switch (body.type) {
    case 'page': {
      const doc = (working ? (body.page.draft ?? body.page.doc) : body.page.doc) as JSONContent;
      // The folder the page sits in (folder phase 7), for a Folder index
      // block set to `here`: only where a member's tree can list it
      // (lib/member-folder-index.ts). Absent from a brain before the pages tree.
      const here = spaceViewHere({
        space: admin ? 'admin' : 'member',
        treeServesPages,
        folderId: (body.page as { folderId?: string | null }).folderId,
      });
      // The outline reads `doc`, the same version the view renders (the
      // draft when `working`).
      return (
        <PageReadWithOutline
          content={doc}
          mapAssetPath={admin ? undefined : memberAssetPath}
          folderId={here.folderId}
        />
      );
    }
    case 'note':
      return (
        <ReaderNote
          content={body.note.content}
          imagePath={admin ? ownerNoteAssetPath : MEMBER_NOTE_ASSET_PATH}
        />
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
          assetUrl={() => asset(api.bytesPath(row.id))}
          chrome="embedded"
        />
      );
  }
}
