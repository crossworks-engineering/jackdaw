'use client';

import { FolderTree, List } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';

/** How a member's or client's screen lists a kind: the flat list, or the
 *  brain's folders as a read-only tree (when the brain serves it). The
 *  choice lives in the URL (`view=folders`). */
export type ReaderView = 'list' | 'folders';

export function readerViewOf(params: { get: (k: string) => string | null }): ReaderView {
  return params.get('view') === 'folders' ? 'folders' : 'list';
}

export function ReaderViewToggle({
  value,
  onChange,
}: {
  value: ReaderView;
  onChange: (v: ReaderView) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(v) => {
        if (v === 'list' || v === 'folders') onChange(v);
      }}
      aria-label="List or folders"
    >
      <ToggleGroupItem value="list" className="h-8 gap-1 px-2 text-xs" title="Newest first">
        <List className="size-3.5" aria-hidden />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="folders" className="h-8 gap-1 px-2 text-xs" title="By folder">
        <FolderTree className="size-3.5" aria-hidden />
        Folders
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
