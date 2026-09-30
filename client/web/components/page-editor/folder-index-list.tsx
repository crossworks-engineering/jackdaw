'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FileText, FolderOpen } from 'lucide-react';
import { ApiError } from '@mantle/web-ui/api-fetch';
import type { TreeFolder, TreeItem } from '@mantle/web-ui/types/tree';
import { fetchFolderPage, folderKey, type TreeSource } from '@/components/item-tree/tree-api';

/** Folder pages read for one index: 50 items each (TREE_PAGE_SIZE). Past
 *  this the block says how it was cut rather than listing on. */
const MAX_PAGES = 10;

/** Every item of the folder, page after page, until done or the cap. */
async function readFolderIndex(
  folderId: string | null,
  source: TreeSource,
): Promise<{ folder: TreeFolder | null; items: TreeItem[]; more: boolean }> {
  const items: TreeItem[] = [];
  let folder: TreeFolder | null = null;
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchFolderPage('pages', folderId, 'name', cursor, source);
    if (i === 0) folder = page.folder;
    items.push(...page.items);
    cursor = page.nextCursor ?? null;
    if (!cursor) return { folder, items, more: false };
  }
  return { folder, items, more: true };
}
import { useViewerRole } from '@/components/member/viewer-role';
import { childPageHref } from '@/lib/child-page-card';

/**
 * The body of a Folder index block (folder phase 7): the pages of one
 * folder, title only, in the folder's name order, read from the reader's own
 * tree route so it is always what THIS reader may see. An admin reads the
 * owner tree, a member its tree, a client its tree; a role not known yet, or
 * a folder the reader cannot see (404), shows nothing but the label.
 *
 * `folderId` null is "the folder this page sits in", resolved by the caller
 * (`here`): undefined here means the caller does not know it (a private
 * item, a brain from before the tree), and the block shows the label alone.
 * Every page of the folder is read (50 at a time) up to a cap, then the
 * block says the list was cut.
 */
export function FolderIndexList({
  folderId,
  hereFolderId,
}: {
  folderId: string | null;
  hereFolderId: string | null | undefined;
}) {
  const role = useViewerRole();
  const source: TreeSource | null =
    role === 'admin' ? 'owner' : role === 'member' ? 'member' : role === 'client' ? 'client' : null;
  // The folder to list: the block's own, else the page's. The root (null)
  // is a place too: a page at the top level lists the top level.
  const target = folderId ?? hereFolderId;
  const known = target !== undefined && source !== null;
  const page = useQuery({
    queryKey: [...folderKey('pages', target ?? null, 'name', source ?? 'owner'), 'index'],
    queryFn: () => readFolderIndex(target ?? null, source ?? 'owner'),
    enabled: known,
    retry: false,
  });
  const items: TreeItem[] = page.data?.items ?? [];
  const name = page.data?.folder?.name ?? (target === null ? 'Pages' : null);
  const hidden = page.error instanceof ApiError && page.error.status === 404;

  return (
    <div
      contentEditable={false}
      data-folder-index-card=""
      className="rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <FolderOpen className="size-3.5" aria-hidden />
        <span>{name ? `In ${name}` : 'Folder index'}</span>
      </div>
      {!known ? null : page.isPending ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : page.isError ? (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {hidden ? 'This folder is not shared with you.' : 'Could not load this folder.'}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">No pages here yet.</p>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((it) => {
            const href = childPageHref(role, it.id);
            const face = (
              <>
                <span className="flex size-5 shrink-0 items-center justify-center text-sm leading-none">
                  {it.icon ?? <FileText className="size-3.5 text-muted-foreground" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
              </>
            );
            return (
              <li key={it.id} className="flex items-center gap-2 text-sm">
                {href ? (
                  <Link
                    href={href}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 no-underline hover:bg-accent/40"
                  >
                    {face}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">{face}</span>
                )}
              </li>
            );
          })}
          {page.data?.more ? (
            <li className="px-1 py-0.5 text-xs text-muted-foreground">
              {`and more: the first ${items.length} are listed; open the folder for the rest.`}
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
