'use client';

import { type JSONContent } from '@tiptap/core';
import { ZoomableImages } from '@/components/image-lightbox';
import { StaticDoc } from './static-doc';

/**
 * Read-only render of a page document, using the same extension set as the
 * editor so output matches exactly.
 *
 * This was a live read-only TipTap editor, with the repo comment that Phase
 * 5's public renderer would one day replace it with a JSON→HTML pass. That
 * renderer turned out not to need writing: `generateHTML` runs the schema's
 * own `renderHTML`, which is what the server's `render-page-doc.ts` emits and
 * what `@mantle/share-ui`'s CSS already styles. `StaticDoc` does it, so
 * selecting through a list of pages no longer mounts and tears down a
 * ProseMirror view per preview.
 *
 * One deliberate difference: a callout renders as the share surface's tinted
 * panel rather than the editor NodeView's bordered box with a lucide icon.
 */
export function PageView({
  content,
  mapAssetPath,
  fileEmbedPath,
  folderId,
}: {
  content: JSONContent;
  /** The folder the page sits in (folder phase 7): what a Folder index
   *  block set to `here` lists. Null at the top level; leave it out when
   *  unknown. */
  folderId?: string | null;
  /** Rewrite image asset paths (the member surface reads bytes from its own
   *  routes). Pass a stable function. */
  mapAssetPath?: (path: string) => string;
  /** Draw file embeds as download chips pointing here (the client portal).
   *  Pass a stable function. */
  fileEmbedPath?: (id: string) => string;
}) {
  // READ surface only: clicking an inline image opens the fullscreen zoom
  // viewer. The EDITOR keeps native clicks (select/drag the node) — zooming
  // while editing would fight the selection.
  return (
    <ZoomableImages className="contents">
      <StaticDoc
        json={content}
        mapAssetPath={mapAssetPath}
        fileEmbedPath={fileEmbedPath}
        hereFolderId={folderId}
        className="prose dark:prose-invert prose-accent prose-document max-w-none focus:outline-none"
      />
    </ZoomableImages>
  );
}
