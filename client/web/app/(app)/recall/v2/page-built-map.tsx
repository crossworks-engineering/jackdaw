'use client';

import { FileText } from 'lucide-react';
import type { RecallMapSummaryDTO } from '@mantle/web-ui/types/recall-v2';
import { MapDetail } from '../map-detail';

/**
 * A page-built (v1) map inside the v2 screen. Its cards are pages, so the v2
 * editor must not write it: it opens in the v1 detail, which edits through
 * the pages exactly as before. These maps are re-authored as native maps by
 * hand and then retired, so this view only has to last until that is done.
 */
export function PageBuiltMap({ map }: { map: RecallMapSummaryDTO }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="flex items-start gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          This map is built from pages (the old way). Edit it through its pages. To move it into the
          new editor, create a native map and copy the card text from the pages, not from this view:
          a page-built map can serve an older copy than its pages hold.
        </span>
      </p>
      <div className="min-h-0 flex-1">
        <MapDetail mapId={map.id} />
      </div>
    </div>
  );
}
