'use client';

import type { JSONContent } from '@tiptap/core';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { PageView } from '@/components/page-editor/page-view';
import { memberAssetPath, memberDrawUrlPath } from '@/lib/member-assets';
import { bytesPath, isAdminSpace, type SpaceItem } from '@/lib/member-space';
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
}: {
  source: 'mine' | 'team';
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
  const { row, body } = item;
  switch (body.type) {
    case 'page': {
      const doc = (working ? (body.page.draft ?? body.page.doc) : body.page.doc) as JSONContent;
      return <PageView content={doc} mapAssetPath={admin ? undefined : memberAssetPath} />;
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
          assetUrl={() => asset(admin ? api.bytesPath(row.id) : bytesPath(source, row.id))}
          chrome="embedded"
        />
      );
  }
}
