'use client';

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { JSONContent } from '@tiptap/core';
import type { MemberLibraryItem } from '@mantle/client-types';
import type { TableDetail } from '@mantle/content-core/table-model';
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';
import { useAssetUrl } from '@mantle/web-ui/hooks/use-asset-url';
import { DrawPresenter } from '@mantle/web-ui/share/draw-presenter';
import { FilePresenter } from '@mantle/web-ui/share/file-presenter';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { TablePresenter } from '@mantle/web-ui/share/table-presenter';
import { Button } from '@mantle/web-ui/ui/button';
import { PageView } from '@/components/page-editor/page-view';
import { AudienceBadge } from '@/components/share/audience-badge';
import { memberAssetPath, memberDrawUrlPath, memberFileUrlPath } from '@/lib/member-assets';

const KIND_ICON = { page: '📄', note: '📝', draw: '✏️', table: '📊', file: '📎' } as const;

/**
 * One Library item, read-only, with the same presenters the share links use.
 * Bytes (images, drawings, files) come from the member routes, which the
 * brain serves at the member's level.
 */
export function MemberReader({ id, onClose }: { id: string; onClose: () => void }) {
  const asset = useAssetUrl();
  const q = useQuery({
    queryKey: ['member-item', id],
    queryFn: () => apiFetch<{ item: MemberLibraryItem }>(`/api/member/library/${id}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          {gone ? 'This item is not available to you.' : 'Could not load this item.'}
        </p>
      </div>
    );
  }
  const item = q.data?.item;
  if (!item) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  let body: React.ReactNode;
  switch (item.type) {
    case 'page':
      body = <PageView content={item.doc as JSONContent} mapAssetPath={memberAssetPath} />;
      break;
    case 'note':
      body = (
        <NotePresenter view={{ title: item.title, content: item.content }} chrome="embedded" />
      );
      break;
    case 'draw':
      body = (
        <DrawPresenter
          view={{ title: item.title, hasSvg: true }}
          src={asset(memberDrawUrlPath(item.id))}
          chrome="embedded"
        />
      );
      break;
    case 'table': {
      const table = item.table as TableDetail;
      body = (
        <TablePresenter
          view={{ title: item.title, icon: item.icon, tabs: null, legacyDoc: table.data }}
          token=""
          chrome="embedded"
        />
      );
      break;
    }
    case 'file':
      body = (
        <FilePresenter
          view={{
            fileId: item.id,
            filename: item.filename,
            mimeType: item.mimeType ?? 'application/octet-stream',
            size: item.sizeBytes ?? 0,
          }}
          assetUrl={(fileId) => asset(memberFileUrlPath(fileId))}
          chrome="embedded"
        />
      );
      break;
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold">
            <span aria-hidden>{item.icon ?? KIND_ICON[item.type]}</span>
            <span className="min-w-0 truncate">{item.title || 'Untitled'}</span>
            <AudienceBadge level={item.audience === 'team' ? null : item.audience} />
          </h2>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        {item.summary && item.type !== 'note' ? (
          <p className="text-sm text-muted-foreground">{item.summary}</p>
        ) : null}
        {body}
      </div>
    </div>
  );
}
