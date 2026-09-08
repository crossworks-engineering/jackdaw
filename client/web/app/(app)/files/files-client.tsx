'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useSurfaceAssist } from '@/components/assistant/use-surface-assist';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  Clock,
  Columns2,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  FolderPlus,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { KIND_TINT, describeFile } from '@mantle/web-ui/lib/mime-label';
import { assetUrl } from '@mantle/web-ui/asset-url';
import { FileEditor } from './file-editor';
import { CreateFileDialog, CreateFolderDialog, RenameDialog } from './files-dialogs';
import { ChildFolders, DualPane, FolderTreeRail } from './files-panes';
import {
  FILES_ROOT,
  describeDerivedCounts,
  effectiveFolderIndexing,
  fmtRelative,
  fmtSize,
  sumDerivedCounts,
} from './files-shared';
import type {
  BulkDeleteResponse,
  DerivedCounts,
  FileRow,
  FileSearchHit,
  FolderRow,
  RenameTarget,
  TextExt,
} from './files-shared';
import { useRealtime } from '@/components/realtime/use-realtime';
import { useUploads } from '@/components/uploads/upload-provider';
import { SetPageTitle } from '@/components/layout/page-title';
import { ShareControl } from '@/components/share-control';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useToast } from '@mantle/web-ui/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';

export function FilesClient() {
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get('path') || FILES_ROOT;

  const treeQuery = useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => apiFetch<{ folders: FolderRow[] }>('/api/files/folders?tree=true'),
  });

  const tree = treeQuery.data?.folders ?? [];
  // Validate the requested path exists; fall back to root (mirrors the old SSR).
  const currentPath = tree.some((f) => f.path === requestedPath) ? requestedPath : FILES_ROOT;
  const currentFolder = tree.find((f) => f.path === currentPath) ?? null;

  const filesQuery = useQuery({
    queryKey: ['files', 'list', currentPath],
    queryFn: () =>
      apiFetch<{ files: FileRow[] }>(`/api/files/files?parent=${encodeURIComponent(currentPath)}`),
    enabled: treeQuery.isSuccess,
    placeholderData: (prev) => prev,
  });

  if (treeQuery.isPending || (filesQuery.isPending && !filesQuery.data)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (treeQuery.isError && !treeQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Couldn&apos;t load your files.</p>
        <Button variant="outline" size="sm" onClick={() => treeQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <FilesView
      tree={tree}
      currentPath={currentPath}
      currentFolder={currentFolder}
      files={filesQuery.data?.files ?? []}
    />
  );
}

function FilesView({
  tree,
  currentPath,
  currentFolder,
  files: initialFiles,
}: {
  tree: FolderRow[];
  currentPath: string;
  currentFolder: FolderRow | null;
  files: FileRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  // Effective brain-indexing mode for the folder being viewed — what the
  // header toggle displays and what un-flagged file rows badge under.
  const foldersByPath = useMemo(() => new Map(tree.map((f) => [f.path, f])), [tree]);
  const folderIndexing = effectiveFolderIndexing(currentPath, foldersByPath);

  // ── View + sort ────────────────────────────────────────────────
  // 'list' is the details table; 'grid' is thumbnail tiles. The choice is a
  // lasting preference, not per-folder state, so it lives in localStorage.
  const [view, setView] = useState<'list' | 'grid' | 'dual'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('files:view');
    return stored === 'grid' ? 'grid' : stored === 'dual' ? 'dual' : 'list';
  });
  const switchView = (v: 'list' | 'grid' | 'dual') => {
    setView(v);
    try {
      window.localStorage.setItem('files:view', v);
    } catch {
      /* private mode */
    }
  };
  type SortKey = 'name' | 'type' | 'size' | 'modified';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc',
  });
  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // Size and recency are usually asked as "biggest / newest first".
          { key, dir: key === 'size' || key === 'modified' ? 'desc' : 'asc' },
    );
  // ── Left-pane search ─────────────────────────────────────────
  // ONE input, two behaviours: the tree filters instantly on every keystroke
  // (pure client work — the whole tree is already here), and content search
  // fires debounced against /api/search?branch=files, which ranks by meaning,
  // not just filename. A metadata-only file (P1) matches on its name-spine.
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FileSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ results: FileSearchHit[] }>(
          `/api/search?q=${encodeURIComponent(q)}&branch=files&limit=30`,
        );
        // Folders surface through the filtered tree; the results list is files.
        setHits(res.results.filter((r) => r.type === 'file'));
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  const searchActive = query.trim().length >= 2;

  // ── Path jump — type/paste a path, Enter navigates ──────────
  const [pathJump, setPathJump] = useState<string | null>(null);
  const submitPathJump = () => {
    if (pathJump === null) return;
    // Accept 'files.work.x', 'files/work/x', or '/files/work/x'.
    const normalized = pathJump.trim().replace(/^\/+/, '').replace(/\//g, '.').replace(/\.+$/, '');
    if (!normalized) return setPathJump(null);
    if (!foldersByPath.has(normalized)) {
      toast.error(`No folder at '${normalized}' — check the path in the tree`);
      return;
    }
    setPathJump(null);
    navigateFolder(normalized);
  };

  // ── Recent — the cross-tree "where did that upload land" view ──
  const [recentView, setRecentView] = useState(false);
  const recentQuery = useQuery({
    queryKey: ['files', 'recent'],
    queryFn: () =>
      apiFetch<{ files: FileRow[] }>('/api/files/files?recent=1&limit=100').then((r) => r.files),
    enabled: recentView,
  });

  const sortedFiles = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const label = (f: FileRow) => describeFile(f.mimeType, f.filename).label;
    return [...files].sort((a, b) => {
      switch (sort.key) {
        case 'size':
          return (a.sizeBytes - b.sizeBytes) * dir;
        case 'modified':
          return (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)) * dir;
        case 'type': {
          const c = label(a).localeCompare(label(b));
          // Same type sorts by name so the order is stable and scannable.
          return (c !== 0 ? c : a.filename.localeCompare(b.filename)) * dir;
        }
        default:
          return a.filename.localeCompare(b.filename, undefined, { numeric: true }) * dir;
      }
    });
  }, [files, sort]);

  // Dialog open-state.
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createFileExt, setCreateFileExt] = useState<TextExt | null>(null);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // Second-step confirm for files that ingest derived nodes from (extracted
  // images, imported tables, pages, notes) — deleting those needs an explicit
  // cascade opt-in; the server refuses otherwise and reports the counts here.
  const [cascadeConfirm, setCascadeConfirm] = useState<{
    ids: string[];
    counts: DerivedCounts;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);

  // Sync local file state when server re-fetches.
  useEffect(() => {
    setFiles(initialFiles);
    setSelectedFileIds(new Set());
  }, [initialFiles]);

  const openFileId = searchParams.get('file');

  // Pin the open file when the preview is up, else the folder being browsed —
  // in both cases the thing the screen is actually about.
  //
  // The folder path rides as meta because a filename alone is ambiguous: two
  // `report.pdf`s in different folders produce identical chips and identical
  // preamble lines, and the agent has no way to tell which one is meant. The
  // path is a handful of bytes and settles it. Content deliberately stays out —
  // once the ref resolves, the node tools can read the body.
  const openFileRow = openFileId ? (files.find((f) => f.id === openFileId) ?? null) : null;
  useSurfaceAssist({
    node: openFileRow
      ? {
          id: openFileRow.id,
          kind: 'file',
          label: openFileRow.filename,
          meta: { folder: openFileRow.parentPath },
        }
      : currentFolder
        ? {
            id: currentFolder.id,
            kind: 'folder',
            label: currentFolder.title || currentFolder.path,
            meta: { path: currentFolder.path },
          }
        : null,
  });

  const refresh = useCallback(() => {
    startTransition(() => {
      void queryClient.invalidateQueries({ queryKey: ['files'] });
    });
  }, [queryClient]);

  // Live updates: a new file/folder (node_ingested) or a finished extraction
  // (node_indexed) for this owner repaints the list — the summary appears the
  // moment the extractor writes it, with no manual refresh.
  useRealtime(['file', 'branch'], refresh);

  const navigateFolder = (path: string) => {
    const sp = new URLSearchParams();
    sp.set('path', path);
    router.push(`/files?${sp.toString()}`);
  };

  const openFile = (fileId: string | null) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (fileId) sp.set('file', fileId);
    else sp.delete('file');
    router.push(`/files?${sp.toString()}`);
  };

  // ─── Upload ──────────────────────────────────────────────────────
  // Hands files to the app-wide background uploader (UploadProvider) so they
  // keep uploading after you navigate away; the realtime layer refreshes this
  // list as each file lands.
  const { enqueue } = useUploads();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerUpload = () => fileInputRef.current?.click();
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    enqueue(e.target.files, currentPath);
    e.target.value = '';
  };

  // ─── Drag-drop ───────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) enqueue(e.dataTransfer.files, currentPath);
  };

  // ─── Delete folder ───────────────────────────────────────────────
  const confirmDeleteFolder = async () => {
    if (!currentFolder || currentFolder.path === FILES_ROOT) return;
    try {
      await apiSend(`/api/files/folders/${currentFolder.id}`, 'DELETE');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      return;
    }
    toast.success(`Deleted "${currentFolder.slug}"`);
    const parent =
      currentFolder.path.lastIndexOf('.') > 0
        ? currentFolder.path.slice(0, currentFolder.path.lastIndexOf('.'))
        : FILES_ROOT;
    navigateFolder(parent);
  };

  // ─── Bulk delete files ───────────────────────────────────────────
  const confirmBulkDelete = async () => {
    if (selectedFileIds.size === 0) return;
    const ids = Array.from(selectedFileIds);
    let res: BulkDeleteResponse;
    try {
      res = await apiSend<BulkDeleteResponse>('/api/files/files', 'DELETE', { ids });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      return;
    }
    const needsCascade = res.hasDerived ?? [];
    if (needsCascade.length > 0) {
      // Some files produced derived nodes; nothing of theirs was deleted.
      // Ask before cascading.
      setCascadeConfirm({
        ids: needsCascade.map((r) => r.fileId),
        counts: sumDerivedCounts(needsCascade.map((r) => r.derived)),
      });
    }
    // Say why a file survived. Without this a guarded file just silently
    // stayed put — worse, a mixed selection reported only the successes.
    for (const r of res.refused ?? []) {
      const names = (r.drawings ?? []).map((d) => d.title).join(', ');
      toast.error(
        r.reason === 'in_drawing'
          ? `Not deleted — used in ${names || 'a drawing'}. Remove it from the drawing first.`
          : 'Not deleted — this file is an email attachment. Delete it from the email instead.',
      );
    }
    if (res.deleted > 0) {
      toast.success(`Deleted ${res.deleted} file${res.deleted === 1 ? '' : 's'}`);
    }
    setSelectedFileIds(new Set());
    refresh();
  };

  const confirmCascadeDelete = async () => {
    if (!cascadeConfirm) return;
    const { ids } = cascadeConfirm;
    try {
      await apiSend('/api/files/files', 'DELETE', { ids, cascade: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      return;
    }
    toast.success(
      `Deleted ${ids.length} file${ids.length === 1 ? '' : 's'} and everything derived from them`,
    );
    setCascadeConfirm(null);
    refresh();
  };

  // ─── Folder description inline edit ──────────────────────────────
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState(currentFolder?.description ?? '');
  const saveDescription = async () => {
    if (!currentFolder) return;
    try {
      await apiSend(`/api/files/folders/${currentFolder.id}`, 'PATCH', { description: draftDesc });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save description');
      return;
    }
    setEditingDesc(false);
    refresh();
  };

  /** Flip the current folder's indexing flag. The server sweeps descendants
   *  and reports how many files it re-queued — surface that, because the
   *  effect is otherwise invisible until the extractor gets there. */
  const setFolderIndexing = async (mode: 'full' | 'metadata' | 'inherit') => {
    if (!currentFolder) return;
    try {
      const res = await apiSend<{ requeued?: number }>(
        `/api/files/folders/${currentFolder.id}`,
        'PATCH',
        { indexing: mode },
      );
      const n = res.requeued ?? 0;
      toast.success(
        mode === 'metadata'
          ? `Content indexing off — files stay findable by name/type/tags${n ? ` (${n} re-indexing)` : ''}`
          : mode === 'full'
            ? `Content indexing on${n ? ` — ${n} file(s) queued for extraction` : ''}`
            : 'Folder now follows its parent for indexing',
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change indexing');
    }
  };

  // ─── Breadcrumbs ─────────────────────────────────────────────────
  const breadcrumbs = useMemo(() => {
    const segments = currentPath.split('.');
    const crumbs: { label: string; path: string }[] = [];
    for (let i = 0; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join('.');
      const label = i === 0 ? 'Files' : segments[i]!.replace(/_/g, '-');
      crumbs.push({ label, path });
    }
    return crumbs;
  }, [currentPath]);

  const allSelected = files.length > 0 && selectedFileIds.size === files.length;
  const someSelected = selectedFileIds.size > 0 && !allSelected;

  return (
    <>
      <MasterDetail
        id="files"
        // 260px, the width this screen has always had — a starting point now
        // rather than a decree.
        defaultListSize="260px"
        // The literal translation of the old `grid-cols-[260px_1fr]`: the tree
        // keeps its draggable width and the right pane takes everything else.
        // It is a six-column file table and, when a file is open, an editor with
        // a side-by-side preview — not a measure of reading text, so the
        // three-panel default's 672px cap would be actively wrong here.
        detailFills
        list={
          /* ── Tree rail ─────────────────────────────────────────
             No `border-r`: `MasterDetail`'s handle IS a 1px `bg-border` rule in
             exactly that place, so keeping the border would draw it twice.
             `h-full` because a grid item stretched to the row and a flex item
             does not — without it the tinted background stops wherever the
             tree happens to end. */
          <aside className="flex h-full flex-col bg-muted/20">
            <div className="p-2 pb-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter folders, search files…"
                  className="h-8 pl-7 pr-7 text-sm"
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-2 pt-1">
              {!searchActive && (
                <button
                  onClick={() => setRecentView(true)}
                  className={
                    'mb-1 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-sm ' +
                    (recentView
                      ? 'bg-primary/10 font-semibold text-primary-ink'
                      : 'hover:bg-muted/40')
                  }
                >
                  <Clock className="size-3.5 text-muted-foreground" />
                  Recent
                </button>
              )}
              <FolderTreeRail
                tree={tree}
                currentPath={recentView ? '' : currentPath}
                onNavigate={(p) => {
                  setRecentView(false);
                  setQuery('');
                  navigateFolder(p);
                }}
                filter={query.trim()}
              />
            </div>
          </aside>
        }
        detail={
          /* ── Main pane ─────────────────────────────────────────
             KEEPS its own `flex h-full flex-col overflow-hidden` and the
             `flex-1 overflow-y-auto` grid inside it, rather than handing the
             scroll to `MasterDetail`'s pane (landmine 9). The breadcrumb header
             and the toolbar are pinned by that structure; letting the outer
             pane scroll would scroll them away. Only ONE scrollbar is ever
             painted — `h-full` + `overflow-hidden` means the outer pane's
             content can never exceed it, so it has nothing to scroll.

             The drag-to-upload handlers stay on this element, so the drop zone
             is still the whole right pane. */
          <div
            className="flex h-full flex-col overflow-hidden"
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {openFileId ? (
              <FileEditor
                key={openFileId}
                fileId={openFileId}
                onClose={() => openFile(null)}
                onSaved={refresh}
              />
            ) : searchActive ? (
              /* ── Search results ────────────────────────────────── */
              <div className="flex h-full flex-col overflow-hidden">
                <SetPageTitle title="Search files" />
                <header className="border-b border-border px-6 py-3">
                  <h2 className="text-sm font-medium">
                    {searching
                      ? 'Searching…'
                      : `${(hits ?? []).length} result${(hits ?? []).length === 1 ? '' : 's'} for “${query.trim()}”`}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ranked by meaning across file names, summaries and content. Name-only files
                    match on name, type and tags.
                  </p>
                </header>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {(hits ?? []).length === 0 && !searching ? (
                    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                      Nothing matched. Content search needs indexed files — name-only files match by
                      filename and tags alone.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {(hits ?? []).map((h) => {
                        const d = describeFile(null, h.title);
                        const HitIcon = d.icon;
                        return (
                          <li key={h.id}>
                            <button
                              onClick={() => {
                                setQuery('');
                                const sp = new URLSearchParams();
                                sp.set('path', h.path);
                                sp.set('file', h.id);
                                router.push(`/files?${sp.toString()}`);
                              }}
                              className="flex w-full items-start gap-3 px-6 py-2.5 text-left hover:bg-muted/30"
                            >
                              <HitIcon
                                aria-hidden
                                className={`mt-0.5 size-4 shrink-0 ${KIND_TINT[d.kind]}`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                  {h.title}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {h.path}
                                  {h.summary ? ` — ${h.summary}` : ''}
                                </span>
                              </span>
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {fmtRelative(h.updatedAt)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : recentView ? (
              /* ── Recent files, whole tree ──────────────────────── */
              <div className="flex h-full flex-col overflow-hidden">
                <SetPageTitle title="Recent files" />
                <header className="border-b border-border px-6 py-3">
                  <h2 className="text-sm font-medium">Recent files</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Newest changes across every folder — an upload or edit puts a file back on top.
                  </p>
                </header>
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  <ul className="divide-y divide-border">
                    {(recentQuery.data ?? []).map((f) => {
                      const d = describeFile(f.mimeType, f.filename);
                      const RecentIcon = d.icon;
                      return (
                        <li key={f.id}>
                          <button
                            onClick={() => {
                              setRecentView(false);
                              const sp = new URLSearchParams();
                              sp.set('path', f.parentPath);
                              sp.set('file', f.id);
                              router.push(`/files?${sp.toString()}`);
                            }}
                            className="flex w-full items-center gap-3 px-6 py-2 text-left hover:bg-muted/30"
                          >
                            <RecentIcon
                              aria-hidden
                              className={`size-4 shrink-0 ${KIND_TINT[d.kind]}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {f.filename}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {f.parentPath}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {fmtSize(f.sizeBytes)}
                            </span>
                            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                              {fmtRelative(f.updatedAt)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {recentQuery.data && recentQuery.data.length === 0 && (
                    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No files yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <SetPageTitle title={currentFolder?.slug ?? 'files'} />
                {/* Header */}
                <header className="border-b border-border px-6 py-3">
                  <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                    {pathJump !== null ? (
                      <Input
                        autoFocus
                        value={pathJump}
                        onChange={(e) => setPathJump(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitPathJump();
                          if (e.key === 'Escape') setPathJump(null);
                        }}
                        onBlur={() => setPathJump(null)}
                        placeholder="files.work.reports — Enter to jump"
                        className="h-7 max-w-md font-mono text-xs"
                      />
                    ) : (
                      <>
                        {breadcrumbs.map((c, i) => (
                          <span key={c.path} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                            <button
                              onClick={() => navigateFolder(c.path)}
                              className={
                                i === breadcrumbs.length - 1
                                  ? 'font-medium text-foreground'
                                  : 'hover:text-foreground'
                              }
                            >
                              {c.label}
                            </button>
                          </span>
                        ))}
                        {/* Click-to-type path entry — the file-manager address
                            bar. The breadcrumb stays the primary affordance;
                            this is for pasting a path from chat or a doc. */}
                        <button
                          aria-label="Go to path"
                          title="Go to path (type or paste, Enter to jump)"
                          onClick={() => setPathJump(currentPath)}
                          className="ml-1 rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted/40 hover:opacity-100"
                        >
                          <Pencil className="size-3" />
                        </button>
                      </>
                    )}
                  </nav>

                  {currentFolder && currentFolder.path !== FILES_ROOT && (
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <ShareControl
                        nodeId={currentFolder.id}
                        teamMode
                        teamHint="Visitors must enter their team token to open the link. The link covers every file in this folder and its subfolders — including files added later."
                      />
                      {/* Brain-indexing toggle. The trigger shows the
                          EFFECTIVE mode (own flag or inherited) because that
                          is what happens to files here; the menu edits the
                          OWN flag. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            disabled={busy}
                            title={
                              folderIndexing.mode === 'metadata'
                                ? `File content here is not indexed into the brain${folderIndexing.from ? ` (inherited from ${folderIndexing.from})` : ''}`
                                : 'File content here is indexed into the brain'
                            }
                          >
                            {folderIndexing.mode === 'metadata' ? <EyeOff /> : <Eye />}
                            {folderIndexing.mode === 'metadata' ? 'Name-only' : 'Indexed'}
                            {folderIndexing.mode === 'metadata' && folderIndexing.from && (
                              <span className="text-[10px] text-muted-foreground">(inherited)</span>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setFolderIndexing('full')}>
                            <Eye /> Index content (search can read inside files)
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setFolderIndexing('metadata')}>
                            <EyeOff /> Name only (store &amp; share, don&apos;t index content)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!currentFolder.indexing}
                            onSelect={() => setFolderIndexing('inherit')}
                          >
                            Inherit from parent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() =>
                          setRenameTarget({
                            kind: 'folder',
                            id: currentFolder.id,
                            slug: currentFolder.slug,
                          })
                        }
                        disabled={busy}
                      >
                        <Pencil /> Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-muted-foreground hover:text-destructive-ink"
                        onClick={() => setDeleteFolderOpen(true)}
                        disabled={busy}
                      >
                        <Trash2 /> Delete folder
                      </Button>
                    </div>
                  )}

                  {/* Description */}
                  <div className="mt-2 text-sm">
                    {editingDesc ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          value={draftDesc}
                          onChange={(e) => setDraftDesc(e.target.value)}
                          rows={2}
                          placeholder="Describe what lives in this folder…"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveDescription}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingDesc(false);
                              setDraftDesc(currentFolder?.description ?? '');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setDraftDesc(currentFolder?.description ?? '');
                          setEditingDesc(true);
                        }}
                        className="group flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <span>
                          {currentFolder?.description ? (
                            currentFolder.description
                          ) : (
                            <span className="italic">no description — click to add</span>
                          )}
                        </span>
                        <Pencil className="size-3 opacity-0 group-hover:opacity-100" aria-hidden />
                      </button>
                    )}
                  </div>
                </header>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm">
                        <Plus /> New <ChevronDown className="opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onSelect={() => setCreateFolderOpen(true)}>
                        <FolderPlus /> Folder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setCreateFileExt('md')}>
                        <FileText /> Markdown file
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCreateFileExt('txt')}>
                        <FileText /> Text file
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCreateFileExt('json')}>
                        <FileJson /> JSON file
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button size="sm" variant="outline" onClick={triggerUpload}>
                    <Upload /> Upload
                  </Button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={onFileInput} />

                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={view === 'list' ? 'secondary' : 'ghost'}
                      className="h-7 w-7 p-0"
                      aria-label="Details view"
                      title="Details view"
                      onClick={() => switchView('list')}
                    >
                      <List className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={view === 'grid' ? 'secondary' : 'ghost'}
                      className="h-7 w-7 p-0"
                      aria-label="Thumbnail view"
                      title="Thumbnail view"
                      onClick={() => switchView('grid')}
                    >
                      <LayoutGrid className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={view === 'dual' ? 'secondary' : 'ghost'}
                      className="h-7 w-7 p-0"
                      aria-label="Two-pane view"
                      title="Two-pane view (copy/move between folders — F5 copy, F6 move, Tab switches panes)"
                      onClick={() => switchView('dual')}
                    >
                      <Columns2 className="size-4" />
                    </Button>
                  </div>

                  {selectedFileIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto text-muted-foreground hover:text-destructive-ink"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 /> Delete {selectedFileIds.size}
                    </Button>
                  )}
                </div>

                {/* Grid */}
                {/* The pane's ONE scrollbar. `scrollbar-thin` per §8 — there is
                    no global default, so an element that scrolls without it
                    gets a fat bar and nothing warns you. */}
                <div className="relative flex-1 overflow-y-auto scrollbar-thin">
                  {dragOver && (
                    <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary-ink">
                      Drop to upload to <code className="ml-1 font-mono">{currentPath}</code>
                    </div>
                  )}

                  {/* Child folders */}
                  <ChildFolders tree={tree} currentPath={currentPath} onNavigate={navigateFolder} />

                  {/* Files */}
                  {/* Dual pane FIRST: an empty current folder is exactly where
                      a two-pane view earns its keep (you're moving things INTO
                      it), so the empty state must not shadow it (audit A3). */}
                  {view === 'dual' ? (
                    <DualPane
                      tree={tree}
                      leftStart={currentPath}
                      onOpenFile={(id, path) => {
                        const sp = new URLSearchParams();
                        sp.set('path', path);
                        sp.set('file', id);
                        router.push(`/files?${sp.toString()}`);
                      }}
                      onChanged={() => {
                        refresh();
                        queryClient.invalidateQueries({ queryKey: ['files'] });
                      }}
                    />
                  ) : files.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No files in this folder. Drop a file anywhere here, or use{' '}
                      <span className="font-medium text-foreground">New</span> to create one.
                    </div>
                  ) : view === 'grid' ? (
                    /* Thumbnail tiles. Images load ?thumb=1 (cached 512px JPEG
                       server-side); a 404 — not an image, render failed —
                       flips the tile to the type icon via onError. Selection
                       stays a list-view feature; a tile click opens. */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-4">
                      {sortedFiles.map((f) => {
                        const described = describeFile(f.mimeType, f.filename);
                        const TypeIcon = described.icon;
                        const isImage = f.mimeType.startsWith('image/');
                        return (
                          <button
                            key={f.id}
                            onClick={() => openFile(f.id)}
                            data-mark-id={f.id}
                            data-mark-kind="file"
                            data-mark-label={f.filename}
                            title={`${f.filename} — ${described.label}, ${fmtSize(f.sizeBytes)}`}
                            className="group flex flex-col overflow-hidden rounded-md border border-border bg-card text-left hover:border-primary/40 hover:shadow-sm"
                          >
                            <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted/40">
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element -- authed same-origin thumbnail; next/image can't carry the asset token
                                <img
                                  src={assetUrl(`/api/files/files/${f.id}?thumb=1`)}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    // Swap to the icon fallback: hide the img,
                                    // reveal the sibling icon span.
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                              ) : null}
                              <span
                                className={
                                  isImage
                                    ? 'hidden items-center justify-center'
                                    : 'flex items-center justify-center'
                                }
                              >
                                <TypeIcon
                                  aria-hidden
                                  className={`size-10 ${KIND_TINT[described.kind]}`}
                                />
                              </span>
                            </span>
                            <span className="flex flex-col gap-0.5 px-2 py-1.5">
                              <span className="truncate text-xs font-medium">{f.filename}</span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                {fmtSize(f.sizeBytes)}
                                {(f.indexing === 'metadata' ||
                                  f.indexingApplied === 'metadata' ||
                                  (!f.indexing && folderIndexing.mode === 'metadata')) && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <EyeOff className="size-2.5" /> name only
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="w-8 px-3 py-2">
                            <Checkbox
                              aria-label="Select all files"
                              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                              onCheckedChange={(v) =>
                                setSelectedFileIds(v ? new Set(files.map((f) => f.id)) : new Set())
                              }
                            />
                          </th>
                          {(
                            [
                              ['name', 'Name', 'text-left'],
                              ['type', 'Type', 'text-left'],
                              ['size', 'Size', 'text-right'],
                            ] as const
                          ).map(([key, label, align]) => (
                            <th key={key} className={`px-3 py-2 ${align}`}>
                              <button
                                onClick={() => toggleSort(key)}
                                className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${align === 'text-right' ? 'flex-row-reverse' : ''}`}
                              >
                                {label}
                                {sort.key === key &&
                                  (sort.dir === 'asc' ? (
                                    <ArrowUp className="size-3" />
                                  ) : (
                                    <ArrowDown className="size-3" />
                                  ))}
                              </button>
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left">Summary</th>
                          <th className="px-3 py-2 text-left">
                            <button
                              onClick={() => toggleSort('modified')}
                              className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                            >
                              Modified
                              {sort.key === 'modified' &&
                                (sort.dir === 'asc' ? (
                                  <ArrowUp className="size-3" />
                                ) : (
                                  <ArrowDown className="size-3" />
                                ))}
                            </button>
                          </th>
                          <th className="w-10 px-3 py-2" aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedFiles.map((f) => {
                          // MIME first, filename as tie-breaker — files uploaded
                          // before the server's mime map learned audio/video/
                          // archives are stored as octet-stream, and the
                          // extension still names them correctly.
                          const described = describeFile(f.mimeType, f.filename);
                          const TypeIcon = described.icon;
                          return (
                            <tr key={f.id} className="hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <Checkbox
                                  aria-label={`Select ${f.filename}`}
                                  checked={selectedFileIds.has(f.id)}
                                  onCheckedChange={(v) =>
                                    setSelectedFileIds((prev) => {
                                      const next = new Set(prev);
                                      if (v) next.add(f.id);
                                      else next.delete(f.id);
                                      return next;
                                    })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => openFile(f.id)}
                                  data-mark-id={f.id}
                                  data-mark-kind="file"
                                  data-mark-label={f.filename}
                                  className="flex items-center gap-2 text-left hover:underline"
                                >
                                  <TypeIcon
                                    aria-hidden
                                    className={`size-4 shrink-0 ${KIND_TINT[described.kind]}`}
                                  />
                                  <span className="font-medium">{f.filename}</span>
                                  <span
                                    title={described.label}
                                    className="text-[10px] uppercase tracking-wider text-muted-foreground"
                                  >
                                    {f.extension}
                                  </span>
                                  {(f.indexing === 'metadata' ||
                                    f.indexingApplied === 'metadata' ||
                                    (!f.indexing && folderIndexing.mode === 'metadata')) && (
                                    <span
                                      title={
                                        f.indexing === 'metadata'
                                          ? 'Name-only: content not indexed (set on this file)'
                                          : 'Name-only: content not indexed (inherited from the folder)'
                                      }
                                      className="inline-flex items-center gap-0.5 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground"
                                    >
                                      <EyeOff className="size-3 shrink-0" /> name only
                                    </span>
                                  )}
                                  {f.summary && f.indexingApplied !== 'metadata' && (
                                    <span
                                      title="Indexed — summary ready"
                                      className="inline-flex items-center text-primary-ink"
                                    >
                                      <ChevronsRight className="size-3.5 shrink-0" />
                                    </span>
                                  )}
                                </button>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                {described.label}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                {fmtSize(f.sizeBytes)}
                              </td>
                              <td className="max-w-[40ch] truncate px-3 py-2 text-xs text-muted-foreground">
                                {f.summary ?? <span className="italic">—</span>}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {fmtRelative(f.updatedAt)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label={`Rename ${f.filename}`}
                                  onClick={() =>
                                    setRenameTarget({
                                      kind: 'file',
                                      id: f.id,
                                      filename: f.filename,
                                      extension: f.extension,
                                    })
                                  }
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      {/* ── Create folder dialog ──────────────────────────────────── */}
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        parentPath={currentPath}
        onCreated={refresh}
      />

      {/* ── Create file dialog ────────────────────────────────────── */}
      <CreateFileDialog
        ext={createFileExt}
        onOpenChange={(open) => !open && setCreateFileExt(null)}
        parentPath={currentPath}
        onCreated={(id) => {
          refresh();
          openFile(id);
        }}
      />

      {/* ── Rename file / folder dialog ───────────────────────────── */}
      <RenameDialog
        target={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        onRenamed={refresh}
      />

      {/* ── Delete folder confirm ─────────────────────────────────── */}
      <AlertDialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{currentFolder?.slug}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder must be empty — move or delete its files first. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteFolder}
            >
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete confirm ───────────────────────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedFileIds.size} file{selectedFileIds.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmBulkDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cascade confirm: files with derived nodes ─────────────── */}
      <AlertDialog
        open={cascadeConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setCascadeConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Also delete everything derived from{' '}
              {cascadeConfirm && cascadeConfirm.ids.length === 1
                ? 'this file'
                : `these ${cascadeConfirm?.ids.length ?? 0} files`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cascadeConfirm
                ? `Ingest produced ${describeDerivedCounts(cascadeConfirm.counts)} from ${
                    cascadeConfirm.ids.length === 1 ? 'this file' : 'these files'
                  }. Nothing has been deleted yet — confirming removes the file${
                    cascadeConfirm.ids.length === 1 ? '' : 's'
                  } and all of it. This can’t be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep everything</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmCascadeDelete}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
