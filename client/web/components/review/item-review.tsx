'use client';

/**
 * Removed in W5c: the review flow (Waiting for approval, Approve, Reject,
 * Take over, Discard, and the members' shared items) is gone from the owner
 * screens. Workspaces replace it. Two parts stay here ONLY because files
 * another W5c helper still owns use them:
 *
 *  - `useReviewQueue`: app/(app)/team-admin/page.tsx and review-redirect.tsx
 *    (Team admin goes in a later W5c part; delete this then).
 *  - `ReviewItemView`: pinned by components/member/mine-page-editor.guard.test.ts
 *    (the member shell goes in W5c; delete this with it).
 *
 * Nothing in the owner item screens imports this file any more.
 */
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { PageReadWithOutline } from '@/components/page-editor/page-read-with-outline';
import { ReaderNote } from '@/components/member/reader-note';
import { noteAssetPath } from '@/lib/note-media';
import {
  QUEUE_KEY,
  memberReview,
  reviewAssetPath,
  reviewBytesPath,
  reviewSvgPath,
  type ReviewItem,
} from '@/lib/member-review';

/** The review queue, as the brain still answers it (team-admin only). */
export function useReviewQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: memberReview.queue,
    refetchInterval: 60_000,
  });
}

/** The saved version, read-only, through the same presenters the member
 *  reader uses; every byte comes from the item's own routes: the
 *  submission's, or (`root`) a shared item's. */
export function ReviewItemView({
  item,
  root,
}: {
  item: ReviewItem;
  root?: (id: string) => string;
}) {
  const asset = useAssetUrl();
  const { row, body } = item;
  const mapAsset = useCallback((p: string) => reviewAssetPath(row.id, p, root), [row.id, root]);
  switch (body.type) {
    case 'page':
      return (
        <PageReadWithOutline
          content={body.page.doc as JSONContent}
          mapAssetPath={mapAsset}
          folderId={(body.page as { folderId?: string | null }).folderId}
          // Before Accept the draft may sit in its author's own folder, which
          // the owner tree does not hold: the block then shows its label alone.
          quietHere
        />
      );
    case 'note':
      return <ReaderNote content={body.note.content} imagePath={noteAssetPath(mapAsset)} />;
    case 'draw':
      return (
        <DrawPresenter
          view={{ title: row.title, hasSvg: true }}
          src={asset(reviewSvgPath(row.id, row.id, root))}
          chrome="embedded"
        />
      );
    case 'table':
      return (
        <TablePresenter
          view={{ title: row.title, icon: row.icon, tabs: null, legacyDoc: body.table.data }}
          token=""
          chrome="embedded"
        />
      );
    case 'file':
      return (
        <FilePresenter
          view={{
            fileId: row.id,
            filename: body.file.filename,
            mimeType: body.file.mimeType,
            size: body.file.sizeBytes,
          }}
          assetUrl={() => asset(reviewBytesPath(row.id, row.id, root))}
          chrome="embedded"
        />
      );
  }
}
