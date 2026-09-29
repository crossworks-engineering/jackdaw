'use client';

import type { JSONContent } from '@tiptap/core';
import type { TableDetail } from '@mantle/content-core/table-model';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { Button } from '@mantle/web-ui/ui/button';
import { PageView } from '@/components/page-editor/page-view';

/** One brain item as a read-only viewer gets it: a Library or accepted item
 *  (a member), or a shared item (a client). The shapes agree per kind. */
export type ReadableItem = { id: string; title: string; icon: string | null } & (
  | { type: 'page'; doc: unknown }
  | { type: 'note'; content: string }
  | { type: 'table'; table: unknown }
  | { type: 'draw' }
  | { type: 'file'; filename: string; mimeType: string | null; sizeBytes: number | null }
);

/** Where a viewer's bytes come from: the member routes or the client ones.
 *  `mapAssetPath` must be a stable function (the page view memoises on it). */
export type ReaderAssets = {
  mapAssetPath: (path: string) => string;
  drawUrlPath: (id: string) => string;
  fileUrlPath: (id: string) => string;
};

/**
 * An item's content, read-only, with the same presenters the share links
 * use (the member Library reader and the client portal share it). No title
 * or actions: the reader around it draws those. A table with more than one
 * tab offers its tabs; `onPickTab` reads the chosen one.
 */
export function ReadOnlyItemBody({
  item,
  assets,
  onPickTab,
}: {
  item: ReadableItem;
  assets: ReaderAssets;
  onPickTab: (tabId: string) => void;
}) {
  const asset = useAssetUrl();
  switch (item.type) {
    case 'page':
      return <PageView content={item.doc as JSONContent} mapAssetPath={assets.mapAssetPath} />;
    case 'note':
      return (
        <NotePresenter view={{ title: item.title, content: item.content }} chrome="embedded" />
      );
    case 'draw':
      return (
        <DrawPresenter
          view={{ title: item.title, hasSvg: true }}
          src={asset(assets.drawUrlPath(item.id))}
          chrome="embedded"
        />
      );
    case 'table': {
      const table = item.table as TableDetail;
      const tabs = table.tabs ?? [];
      const current = table.tabId ?? tabs[0]?.id ?? null;
      // A tab past the server's materialize window arrives as a leading window.
      const totalRows = tabs.find((t) => t.id === current)?.rows ?? table.data.rows.length;
      return (
        <div className="space-y-2">
          {tabs.length > 1 ? (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Table tabs">
              {tabs.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={t.id === current ? 'default' : 'ghost'}
                  role="tab"
                  aria-selected={t.id === current}
                  onClick={() => onPickTab(t.id)}
                >
                  {t.name}
                  <span className="text-xs opacity-70">{t.rows.toLocaleString()}</span>
                </Button>
              ))}
            </div>
          ) : null}
          <TablePresenter
            view={{ title: item.title, icon: item.icon, tabs: null, legacyDoc: table.data }}
            token=""
            chrome="embedded"
          />
          {table.docClipped ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {table.data.rows.length.toLocaleString()} of{' '}
              {totalRows.toLocaleString()} rows.
            </p>
          ) : null}
        </div>
      );
    }
    case 'file':
      return (
        <FilePresenter
          view={{
            fileId: item.id,
            filename: item.filename,
            mimeType: item.mimeType ?? 'application/octet-stream',
            size: item.sizeBytes ?? 0,
          }}
          assetUrl={(fileId) => asset(assets.fileUrlPath(fileId))}
          chrome="embedded"
        />
      );
  }
}
