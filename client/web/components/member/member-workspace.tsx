'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import type { MemberItemRow } from '@mantle/client-types';
import { apiEventStream, apiFetch } from '@mantle/web-ui/api-fetch';
import { Button } from '@mantle/web-ui/ui/button';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useToast } from '@mantle/web-ui/ui/toast';
import useMediaQuery from '@mantle/web-ui/hooks/use-media-query';
import { SetPageTitle } from '@/components/layout/page-title';
import { NewButton } from '@/components/item-list/item-list-header';
import {
  memberSpace,
  memberUploadRefusal,
  workspaceNavMode,
  workspaceQuery,
  type SpaceItemRow,
  type SpaceKind,
  type WorkspaceSource,
} from '@/lib/member-space';
import { srcOf } from '@/lib/member-items';
import { MEMBER_KIND } from '@/lib/member-kinds';
import { sectionOf } from '@/lib/last-opened';
import { useRememberLastOpened } from '@/components/last-opened/last-opened';
import { ItemTree } from '@/components/item-tree/item-tree';
import { useTreeSearch } from '@/components/item-tree/use-tree-search';
import { treeKey } from '@/components/item-tree/tree-api';
import { TREE_KIND_SPECS, type TreeFolder, type TreeItem } from '@mantle/web-ui/types/tree';
import { useAcceptedDraftNotice, useLiveTreeFolder } from '@/components/item-tree/use-tree-cache';
import { readerTreeAdapter } from '@/components/item-tree/kinds/reader';
import { treeKindOfItem, useReaderTreeServes } from '@/components/item-tree/use-tree-kinds';
import { MemberReader } from './member-reader';
import { MineItem } from './mine-item';
import { ClientRequestItem } from './client-request-item';
import { TeamDraftItem } from './team-draft-item';
import { MemberItemSections, useMemberSectionLists } from './member-item-sections';
import { spaceErrorMessage } from './space-status';

const KIND = MEMBER_KIND;

function asSource(v: string | null): WorkspaceSource {
  return v === 'team' || v === 'library' || v === 'accepted' || v === 'client-request' ? v : 'mine';
}

/** The params of the member list this screen replaced (its view switch,
 *  State filter and pager). A link that still carries them opens the folder
 *  view; the screen drops them from the address. `q` stays: it is the tree's
 *  search. */
export const RETIRED_LIST_PARAMS = ['view', 'state', 'page'] as const;

/** The address without the retired list params, or null when it has none. */
export function withoutRetiredParams(current: string): string | null {
  const sp = new URLSearchParams(current);
  if (!RETIRED_LIST_PARAMS.some((k) => sp.has(k))) return null;
  for (const k of RETIRED_LIST_PARAMS) sp.delete(k);
  return sp.toString();
}

/** The tree row's source as the URL's `src` (which item view opens it). */
export function srcOfTreeItem(item: Pick<TreeItem, 'source'>): WorkspaceSource {
  return item.source === 'own' ? 'mine' : item.source === 'team' ? 'team' : 'library';
}

/**
 * Each kind's panes as its admin screen sizes them (pages-client,
 * notes-client, draws-client, tables-shell, files-client): a member's
 * screen is the admin's, scoped.
 */
const LAYOUT: Record<
  SpaceKind,
  {
    defaultListSize: string;
    minListSize?: string;
    maxListSize?: string;
    detailFills?: boolean;
    defaultDetailSize?: string;
    minDetailSize?: string;
    maxDetailSize?: string;
  }
> = {
  page: { defaultListSize: '300px', minListSize: '220px', maxListSize: '560px', detailFills: true },
  note: {
    defaultListSize: '380px',
    minListSize: '300px',
    maxListSize: '760px',
    defaultDetailSize: '900px',
    minDetailSize: '480px',
    maxDetailSize: '100%',
  },
  draw: { defaultListSize: '360px', detailFills: true },
  table: {
    defaultListSize: '320px',
    minListSize: '220px',
    maxListSize: '520px',
    detailFills: true,
  },
  file: { defaultListSize: '260px', detailFills: true },
};

/**
 * Personal items change under a member from other tabs and teammates: one
 * event stream (own space + team-shared, ids only) refreshes what shows.
 */
function useSpaceEvents() {
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;
  useEffect(() => {
    const stop = apiEventStream(
      '/api/member/realtime',
      () => {
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-list'] });
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-item'] });
        void qcRef.current.invalidateQueries({ queryKey: ['member-space-comments'] });
        // The member's tree shows its drafts' states too (folder plan phase 5).
        void qcRef.current.invalidateQueries({ queryKey: ['tree'] });
      },
      { maxAttempts: 8 },
    );
    return stop;
  }, []);
}

/**
 * A member's screen for one kind (member logins): the admin screen's folder
 * view, scoped to what the member may see (2026-10-09). ONE tree, the same
 * component, layout and search as the admin's: the brain's items the member
 * reads (the Library), the member's own folders and drafts, and teammates'
 * shared drafts, each draft wearing its state. The member manages only its
 * own folders and drafts there; nothing an admin does is offered.
 *
 * Above the tree, small sections hold what the tree does not: own items with
 * an admin, the member's accepted work, and clients' requests
 * (member-item-sections.tsx). The open item is `?id=` with `?src=` naming
 * which view opens it (own, a teammate's draft, the Library, accepted, or a
 * client's submitted item, read only); the tree's search is `?q=`.
 */
export function MemberWorkspace({ kind }: { kind: SpaceKind }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const meta = KIND[kind];
  // `?selected=` is what the admin screens' /notes/<id> and /tables/<id>
  // redirects write; a member's screen reads it the same way.
  const openId = params.get('id') ?? params.get('selected');
  const openSource = asSource(params.get('src'));
  // The section opens on this item next time (lib/last-opened.ts). A
  // client's submitted item is not one of the member's sources to restore.
  useRememberLastOpened(
    sectionOf(MEMBER_KIND[kind].path),
    openId && openSource !== 'client-request' ? openId : null,
  );
  const treeKind = treeKindOfItem(kind);
  const treeAdapter = treeKind ? readerTreeAdapter(treeKind) : null;
  const serves = useReaderTreeServes('member', treeKind);
  const [treeGone, setTreeGone] = useState(false);
  const [treeQuery, setTreeQuery] = useTreeSearch();
  // The folder the tree has open: where New and Upload file a draft (null =
  // the top level, the tree's root row). Followed through the tree's cache:
  // renamed or moved, it is the folder as it is now; deleted (here or in
  // another tab), New and Upload go back to the top level.
  const [pickedFolder, setTreeFolder] = useState<TreeFolder | null>(null);
  const treeFolder = useLiveTreeFolder(treeKind, 'member', pickedFolder);
  useEffect(() => {
    if (pickedFolder && !treeFolder) setTreeFolder(null);
  }, [pickedFolder, treeFolder]);
  // A draft that was with an admin leaves the folders when it is accepted
  // into the brain: say where it went rather than lose it quietly.
  useAcceptedDraftNotice(treeKind, (d) =>
    toast.info(
      `“${d.title || 'Untitled'}” is no longer in your folders: an admin accepted it into the brain. It shows under By me above the tree.`,
    ),
  );
  const sectionLists = useMemberSectionLists(kind);
  // The state of the tree row last opened: an own draft an admin holds opens
  // as such (audit F07), as its list row did.
  const [treePick, setTreePick] = useState<{ id: string; withAdmin: boolean } | null>(null);
  const treeFileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  useSpaceEvents();

  // An old list link (`?view=`, `?state=`, `?page=`) lands here: drop what
  // no longer means anything, keep the item and the search.
  useEffect(() => {
    const qs = withoutRetiredParams(params.toString());
    if (qs !== null) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // The item this screen pushed a history entry for, from no open item:
  // Close then goes Back to that entry instead of stacking a second one.
  const pushedFromList = useRef<string | null>(null);
  const setParams = useCallback(
    (next: { src?: WorkspaceSource; id?: string | null }) => {
      const current = params.toString();
      const qs = workspaceQuery(current, next);
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (workspaceNavMode(current, next) === 'push') {
        pushedFromList.current = openId ? null : (next.id ?? null);
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [params, pathname, router, openId],
  );

  const create = async (folderId?: string | null) => {
    if (kind === 'file') return;
    setBusy(true);
    try {
      const { item } = await memberSpace.create({
        type: kind,
        title: '',
        ...(folderId ? { folderId } : {}),
      });
      void qc.invalidateQueries({ queryKey: ['member-space-list'] });
      if (treeKind) void qc.invalidateQueries({ queryKey: treeKey(treeKind, 'member') });
      setParams({ src: 'mine', id: item.id });
    } catch (err) {
      toast.error(spaceErrorMessage(err, `Could not create the ${meta.one}.`));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File, folderId?: string | null) => {
    // Refused here, before a byte is sent: this upload skips the upload dock
    // and its size check, and the brain would only refuse it after the lot.
    const tooLarge = memberUploadRefusal(file.size);
    if (tooLarge) {
      toast.error(tooLarge);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (folderId) fd.append('folderId', folderId);
      fd.append('file', file, file.name);
      const res = await apiFetch<{ row: SpaceItemRow }>('/api/member/space-files', {
        method: 'POST',
        body: fd,
      });
      void qc.invalidateQueries({ queryKey: ['member-space-list'] });
      if (treeKind) void qc.invalidateQueries({ queryKey: treeKey(treeKind, 'member') });
      setParams({ src: 'mine', id: res.row.id });
      toast.success('Uploaded to your files.');
    } catch (err) {
      toast.error(spaceErrorMessage(err, 'Could not upload the file.'));
    } finally {
      setBusy(false);
    }
  };

  // The open item's row in a section, when it came from one: a client
  // request names its author, an own item with an admin opens as such.
  const sectionRow: MemberItemRow | null = openId
    ? (sectionLists
        .flatMap((l) => l.rows)
        .find((r) => r.id === openId && srcOf(r.source) === openSource) ?? null)
    : null;
  const openKey = openId ? `${openSource}:${openId}` : null;

  const treeReady = serves === true && treeAdapter !== null && treeKind !== null && !treeGone;

  const listPane =
    serves === undefined ? (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    ) : !treeReady || !treeKind || !treeAdapter ? (
      // A brain from before folder sharing sends no member tree kinds, and
      // a tree call that 404s means the same.
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">
          Folders need a newer brain. Ask an admin to update it.
        </p>
      </div>
    ) : (
      <div className="flex h-full min-h-0 flex-col">
        <MemberItemSections
          kind={kind}
          lists={sectionLists}
          selectedKey={openKey}
          onOpen={(row) => setParams({ src: srcOf(row.source), id: row.id })}
        />
        <aside data-tour="member-tree" className="flex min-h-0 flex-1 flex-col bg-muted/20">
          <ItemTree
            kind={treeKind}
            source="member"
            mode="manage"
            adapter={treeAdapter}
            query={treeQuery}
            onQueryChange={setTreeQuery}
            searchPlaceholder={`Search ${meta.many} and folders…`}
            // The root row: New and Upload back at the top level.
            rootLabel={`All ${meta.many}`}
            capOnNarrow={false}
            selectedItemId={openId}
            selectedFolderPath={treeFolder?.path ?? TREE_KIND_SPECS[treeKind].root}
            onOpenFolder={setTreeFolder}
            // A draft made in that folder, like New with the folder open.
            // Files come by upload, so their folders offer no New.
            {...(meta.create
              ? {
                  newItemInFolder: {
                    label: meta.one,
                    onCreate: (f: TreeFolder) => {
                      setTreeFolder(f);
                      void create(f.id);
                    },
                  },
                }
              : {})}
            onOpenItem={(item) => {
              setTreePick({ id: item.id, withAdmin: item.state === 'with-admin' });
              setParams({ src: srcOfTreeItem(item), id: item.id });
            }}
            actions={
              meta.create ? (
                <NewButton
                  onClick={() => void create(treeFolder?.id ?? null)}
                  busy={busy}
                  title={treeFolder ? `New ${meta.one} in “${treeFolder.name}”` : `New ${meta.one}`}
                />
              ) : meta.upload ? (
                <>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => treeFileInput.current?.click()}
                    title={treeFolder ? `Upload a file to “${treeFolder.name}”` : 'Upload a file'}
                    aria-label="Upload a file"
                  >
                    <Upload />
                  </Button>
                  <input
                    ref={treeFileInput}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void upload(f, treeFolder?.id ?? null);
                    }}
                  />
                </>
              ) : null
            }
            onChanged={() => {
              void qc.invalidateQueries({ queryKey: ['member-space-list'] });
              // The open draft may have been filed elsewhere: its read names
              // its folder (a Folder index block set to `here` lists it).
              void qc.invalidateQueries({ queryKey: ['member-space-item'] });
            }}
            onUnsupported={() => setTreeGone(true)}
          />
        </aside>
      </div>
    );

  const close = () => {
    if (openId && pushedFromList.current === openId) {
      pushedFromList.current = null;
      router.back();
    } else {
      setParams({ id: null });
    }
  };
  // An own item an admin took over (audit F07): the row says so, and the
  // item view opens nothing of it.
  const withAdmin =
    sectionRow?.pill === 'with-admin' || (treePick?.id === openId && treePick.withAdmin);
  const detailPane = openId ? (
    openSource === 'mine' ? (
      <MineItem key={openId} id={openId} onClose={close} withAdmin={withAdmin} />
    ) : openSource === 'team' ? (
      <TeamDraftItem key={openId} id={openId} onClose={close} />
    ) : openSource === 'client-request' ? (
      <ClientRequestItem
        key={openId}
        id={openId}
        author={sectionRow?.author ?? null}
        onClose={close}
      />
    ) : (
      <MemberReader
        key={`${openSource}:${openId}`}
        id={openId}
        source={openSource === 'accepted' ? 'accepted' : 'library'}
        onClose={close}
      />
    )
  ) : (
    <div className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
      {meta.create
        ? `Select a ${meta.one}, or click New to start one.`
        : `Select a ${meta.one}, or upload one.`}
    </div>
  );

  return (
    <>
      <SetPageTitle title={meta.title} />
      {isDesktop === false ? (
        // List OR detail. The tree is hidden, not unmounted, while an item
        // is open (MasterDetail's contract on a wide screen too), so it keeps
        // its search and its open folders when the item closes.
        <div className="relative h-full min-h-0">
          <div className={openId ? 'hidden' : 'h-full min-h-0'}>{listPane}</div>
          {openId ? detailPane : null}
        </div>
      ) : (
        <MasterDetail id={`member-${kind}`} {...LAYOUT[kind]} list={listPane} detail={detailPane} />
      )}
    </>
  );
}
