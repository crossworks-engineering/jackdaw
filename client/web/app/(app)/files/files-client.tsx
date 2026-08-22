'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend, ApiError } from '@mantle/web-ui/api-fetch';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { useSurfaceAssist } from '@/components/assistant/use-surface-assist';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import {
  ChevronDown,
  ChevronRight,
  ChevronsRight,
  FileJson,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FileText,
  Clock,
  Columns2,
  LayoutGrid,
  List,
  Search,
  X,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { describeFile, KIND_TINT } from '@mantle/web-ui/lib/mime-label';
import { assetUrl } from '@mantle/web-ui/asset-url';
import { FileEditor } from './file-editor';
import { useRealtime } from '@/components/realtime/use-realtime';
import { useUploads } from '@/components/uploads/upload-provider';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import { SetPageTitle } from '@/components/layout/page-title';
import { ShareControl } from '@/components/share-control';
import { Button } from '@mantle/web-ui/ui/button';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import { Input } from '@mantle/web-ui/ui/input';
import { Label } from '@mantle/web-ui/ui/label';
import { Textarea } from '@mantle/web-ui/ui/textarea';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useToast } from '@mantle/web-ui/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@mantle/web-ui/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@mantle/web-ui/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@mantle/web-ui/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@mantle/web-ui/ui/alert-dialog';

type FolderRow = {
  id: string;
  path: string;
  title: string;
  slug: string;
  description: string;
  /** The folder's own indexing flag; null = inherit from ancestors. */
  indexing: 'full' | 'metadata' | null;
  childFolderCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

type FileRow = {
  id: string;
  parentPath: string;
  filename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  isText: boolean;
  summary: string | null;
  /** Own flag (null = folder chain decides) and the mode the extractor last
   *  actually ran — the badge reads the latter. */
  indexing: 'full' | 'metadata' | null;
  indexingApplied: 'full' | 'metadata' | null;
  createdAt: string;
  updatedAt: string;
};

/** One `/api/search?branch=files` hit — the server's node shape, trimmed to
 *  what the results list renders. */
type FileSearchHit = {
  id: string;
  type: string;
  title: string;
  path: string;
  summary: string | null;
  updatedAt: string;
};

type TextExt = 'md' | 'txt' | 'json';

const FILES_ROOT = 'files';

/** Server-shaped counts of the nodes ingest derived from a file — mirrors
 *  DerivedCounts in @mantle/files (the client bundle can't import it). */
type DerivedCounts = {
  images: number;
  tables: number;
  pages: number;
  notes: number;
  other: number;
  total: number;
};

type BulkDeleteResponse = {
  deleted: number;
  hasDerived?: Array<{ fileId: string; derived: DerivedCounts }>;
  /** Refusals the user cannot resolve by confirming — surfaced so a blocked
   *  delete is never a silent no-op. */
  refused?: Array<{
    fileId: string;
    reason: 'attachment' | 'in_drawing';
    drawings?: Array<{ id: string; title: string }>;
  }>;
};

function sumDerivedCounts(all: DerivedCounts[]): DerivedCounts {
  const sum: DerivedCounts = { images: 0, tables: 0, pages: 0, notes: 0, other: 0, total: 0 };
  for (const c of all) {
    sum.images += c.images;
    sum.tables += c.tables;
    sum.pages += c.pages;
    sum.notes += c.notes;
    sum.other += c.other;
    sum.total += c.total;
  }
  return sum;
}

/** "34 images, 2 tables and 1 note" — matches the server's phrasing. */
function describeDerivedCounts(c: DerivedCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  if (c.images) parts.push(plural(c.images, 'image', 'images'));
  if (c.tables) parts.push(plural(c.tables, 'table', 'tables'));
  if (c.pages) parts.push(plural(c.pages, 'page', 'pages'));
  if (c.notes) parts.push(plural(c.notes, 'note', 'notes'));
  if (c.other) parts.push(plural(c.other, 'other node', 'other nodes'));
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/** What the rename dialog is acting on — a file (stem, extension preserved) or
 *  a folder (slug). */
type RenameTarget =
  | { kind: 'file'; id: string; filename: string; extension: string }
  | { kind: 'folder'; id: string; slug: string };

/** Normalize a free-typed folder name into a slug (lowercase, dashes). */
/**
 * Folder-slug normaliser — deliberately NOT the shared `@/lib/slugify`.
 *
 * This one *deletes* punctuation ("Q1/Q2" → "q1q2") rather than turning runs of
 * it into a separator ("q1-q2"), and it has no length cap. That's the folder
 * on-disk path convention, and the slug it produces is sent to
 * `/api/files/folders` as the persisted folder identity — so its output is
 * load-bearing and must stay byte-stable. Kept local, and distinct from the
 * shared slugify, precisely so a future "de-dupe" doesn't silently re-slug
 * existing folders. See lib/slugify.ts for the divergence history.
 */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Outer data-fetch wrapper so the page stays data-free. Fetches the folder
 * tree + the current folder's files from the existing /api/files endpoints,
 * resolves the `?path` param against the tree (falling back to root), and
 * derives the current folder from the tree — no dedicated endpoint needed.
 */
/**
 * Effective indexing mode for a path, resolved from the loaded folder tree the
 * same way the server resolves it at extract time: own flag, else the nearest
 * flagged ancestor, else full. The tree always loads whole, so every ancestor
 * is present — no extra request needed.
 */
function effectiveFolderIndexing(
  path: string,
  byPath: Map<string, FolderRow>,
): { mode: 'full' | 'metadata'; from: string | null } {
  const segs = path.split('.');
  for (let i = segs.length; i >= 1; i--) {
    const p = segs.slice(0, i).join('.');
    const own = byPath.get(p)?.indexing;
    if (own) return { mode: own, from: p === path ? null : p };
  }
  return { mode: 'full', from: null };
}

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

// ─── Rename file / folder dialog ───────────────────────────────────
function RenameDialog({
  target,
  onOpenChange,
  onRenamed,
}: {
  target: RenameTarget | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setBusy(false);
    if (target.kind === 'file') {
      const suffix = target.extension ? `.${target.extension}` : '';
      setName(
        suffix && target.filename.endsWith(suffix)
          ? target.filename.slice(0, -suffix.length)
          : target.filename,
      );
    } else {
      setName(target.slug);
    }
  }, [target]);

  if (!target) return null;
  const isFile = target.kind === 'file';
  const valid = name.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const url = isFile ? `/api/files/files/${target.id}` : `/api/files/folders/${target.id}`;
    try {
      await apiSend(url, 'PATCH', { rename: name.trim() });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Rename failed');
      return;
    } finally {
      setBusy(false);
    }
    toast.success('Renamed');
    onRenamed();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {isFile ? 'file' : 'folder'}</DialogTitle>
          <DialogDescription>
            {isFile
              ? 'The extension is kept — only the name changes.'
              : 'Every file and sub-folder inside moves with it.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-input">New name</Label>
            <div className="flex items-center gap-1">
              <Input
                id="rename-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {isFile && target.extension && (
                <span className="shrink-0 text-sm text-muted-foreground">.{target.extension}</span>
              )}
            </div>
            {!isFile && name.trim() && (
              <p className="text-xs text-muted-foreground">
                Saved as <code className="font-mono">{slugify(name)}</code>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={busy} disabled={!valid}>
              Rename {isFile ? 'file' : 'folder'}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create folder dialog ──────────────────────────────────────────
function CreateFolderDialog({
  open,
  onOpenChange,
  parentPath,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentPath: string;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setBusy(false);
    }
  }, [open]);

  const slug = slugify(name);
  const valid = slug.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await apiSend('/api/files/folders', 'POST', { parentPath, slug, description });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create folder');
      setBusy(false);
      return;
    }
    toast.success(`Created folder “${slug}”`);
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Created inside <code className="font-mono">{parentPath}</code>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-folder"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Saved as <code className="font-mono">{slug || '…'}</code> — lowercase, dashes only.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="folder-desc">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="folder-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What lives in this folder?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={busy} disabled={!valid}>
              Create folder
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create file dialog ────────────────────────────────────────────
function CreateFileDialog({
  ext,
  onOpenChange,
  parentPath,
  onCreated,
}: {
  ext: TextExt | null;
  onOpenChange: (open: boolean) => void;
  parentPath: string;
  onCreated: (fileId: string) => void;
}) {
  const toast = useToast();
  const open = ext !== null;
  const [stem, setStem] = useState('');
  const [type, setType] = useState<TextExt>('md');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ext) {
      setStem('');
      setType(ext);
      setBusy(false);
    }
  }, [ext]);

  const cleanStem = stem.trim().replace(/\.[^.]*$/, '');
  const valid = cleanStem.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    let file: FileRow;
    try {
      ({ file } = await apiSend<{ file: FileRow }>('/api/files/files', 'POST', {
        parentPath,
        filename: `${cleanStem}.${type}`,
        content: defaultBodyFor(type),
      }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create file');
      setBusy(false);
      return;
    }
    toast.success(`Created ${file.filename}`);
    onOpenChange(false);
    onCreated(file.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>
            Created inside <code className="font-mono">{parentPath}</code> and opened for editing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={type}
              onValueChange={(v) => v && setType(v as TextExt)}
            >
              <ToggleGroupItem value="md">Markdown</ToggleGroupItem>
              <ToggleGroupItem value="txt">Text</ToggleGroupItem>
              <ToggleGroupItem value="json">JSON</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file-stem">Filename</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-stem"
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                placeholder="untitled"
                autoFocus
              />
              <span className="shrink-0 text-sm text-muted-foreground">.{type}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={busy} disabled={!valid}>
              Create file
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChildFolders({
  tree,
  currentPath,
  onNavigate,
}: {
  tree: FolderRow[];
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const children = useMemo(
    () =>
      tree
        .filter((f) => {
          if (f.path === currentPath) return false;
          if (!f.path.startsWith(currentPath + '.')) return false;
          const rest = f.path.slice(currentPath.length + 1);
          return !rest.includes('.');
        })
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    [tree, currentPath],
  );

  if (children.length === 0) return null;

  return (
    <div className="px-6 py-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Folders ({children.length})
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {children.map((f) => (
          <li key={f.id}>
            <ListCard
              onClick={() => onNavigate(f.path)}
              data-mark-id={f.id}
              data-mark-kind="folder"
              data-mark-label={f.slug}
              className="flex items-start gap-2"
            >
              <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <ListCardTitle>{f.slug}</ListCardTitle>
                {f.description && <ListCardMeta>{f.description}</ListCardMeta>}
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.childFolderCount} folders · {f.fileCount} files
                </div>
              </div>
            </ListCard>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The two-pane (Norton Commander) manager. Each pane browses independently;
 * Copy/Move act on the ACTIVE pane's selection toward the other. Keyboard:
 * F5 copy, F6 move, Tab switches panes. Selection is per-pane and clears on
 * navigation — a selection you can no longer see is a selection you will
 * regret acting on.
 */
function DualPane({
  tree,
  leftStart,
  onOpenFile,
  onChanged,
}: {
  tree: FolderRow[];
  leftStart: string;
  onOpenFile: (id: string, parentPath: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [paths, setPaths] = useState<[string, string]>([leftStart, FILES_ROOT]);
  const [active, setActive] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<[Set<string>, Set<string>]>([new Set(), new Set()]);
  const [busy, setBusy] = useState(false);

  const setPaneState = (i: 0 | 1, path: string) => {
    setPaths((prev) => (i === 0 ? [path, prev[1]] : [prev[0], path]));
    setSelected((prev) => {
      const next: [Set<string>, Set<string>] = [new Set(prev[0]), new Set(prev[1])];
      next[i] = new Set();
      return next;
    });
  };

  const toggleSelect = (i: 0 | 1, key: string) =>
    setSelected((prev) => {
      const next: [Set<string>, Set<string>] = [new Set(prev[0]), new Set(prev[1])];
      if (next[i].has(key)) next[i].delete(key);
      else next[i].add(key);
      return next;
    });

  /**
   * Run copy/move for the active pane's selection toward the other pane.
   * Sequential, first error stops the batch — a half-applied bulk op with a
   * clear "stopped at X: why" beats a parallel scatter of failures.
   */
  const transfer = async (op: 'copy' | 'move') => {
    const src = active;
    const dest = paths[src === 0 ? 1 : 0];
    const sel = [...selected[src]];
    if (sel.length === 0 || busy) return;
    if (dest === paths[src]) {
      toast.error('Both panes show the same folder — nothing to do');
      return;
    }
    setBusy(true);
    let done = 0;
    try {
      for (const key of sel) {
        const [kind, id] = key.split(':', 2) as ['file' | 'folder', string];
        if (kind === 'file') {
          if (op === 'move') await apiSend(`/api/files/files/${id}`, 'PATCH', { move: dest });
          else await apiSend(`/api/files/files/${id}`, 'POST', { copy_to: dest });
        } else {
          if (op === 'move') await apiSend(`/api/files/folders/${id}`, 'PATCH', { move: dest });
          else await apiSend(`/api/files/folders/${id}`, 'POST', { copy_to: dest });
        }
        done++;
      }
      toast.success(`${op === 'move' ? 'Moved' : 'Copied'} ${done} item${done === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(
        `${op === 'move' ? 'Move' : 'Copy'} stopped after ${done} of ${sel.length}: ` +
          (err instanceof ApiError ? err.message : 'request failed'),
      );
    } finally {
      setBusy(false);
      setSelected([new Set(), new Set()]);
      onChanged();
    }
  };

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        // The classics. Tab is intercepted only here, inside the manager —
        // everywhere else it stays the browser's.
        if (e.key === 'Tab') {
          e.preventDefault();
          setActive((a) => (a === 0 ? 1 : 0));
        } else if (e.key === 'F5') {
          e.preventDefault();
          void transfer('copy');
        } else if (e.key === 'F6') {
          e.preventDefault();
          void transfer('move');
        }
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
        {([0, 1] as const).map((i) => (
          <FilePane
            key={i}
            tree={tree}
            path={paths[i]}
            active={active === i}
            selected={selected[i]}
            onActivate={() => setActive(i)}
            onNavigate={(p) => setPaneState(i, p)}
            onToggleSelect={(k) => toggleSelect(i, k)}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-sm">
        <span className="text-xs text-muted-foreground">
          {selected[active].size} selected in the {active === 0 ? 'left' : 'right'} pane
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selected[active].size === 0}
            onClick={() => void transfer('copy')}
            title="F5"
          >
            Copy {active === 0 ? '→' : '←'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || selected[active].size === 0}
            onClick={() => void transfer('move')}
            title="F6"
          >
            Move {active === 0 ? '→' : '←'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One pane of the two-pane manager: its own path, listing and selection. */
function FilePane({
  tree,
  path,
  active,
  selected,
  onActivate,
  onNavigate,
  onToggleSelect,
  onOpenFile,
}: {
  tree: FolderRow[];
  path: string;
  active: boolean;
  selected: Set<string>;
  onActivate: () => void;
  onNavigate: (path: string) => void;
  onToggleSelect: (key: string) => void;
  onOpenFile: (id: string, parentPath: string) => void;
}) {
  const filesQuery = useQuery({
    queryKey: ['files', 'list', path],
    queryFn: () =>
      apiFetch<{ files: FileRow[] }>(`/api/files/files?parent=${encodeURIComponent(path)}`).then(
        (r) => r.files,
      ),
  });
  const childFolders = useMemo(
    () =>
      tree
        .filter(
          (f) =>
            f.path.startsWith(`${path}.`) &&
            f.path.split('.').length === path.split('.').length + 1,
        )
        .sort((a, b) => a.slug.localeCompare(b.slug)),
    [tree, path],
  );
  const parentPath = path.includes('.') ? path.split('.').slice(0, -1).join('.') : null;

  return (
    <div onClick={onActivate} className={`flex min-h-0 flex-col ${active ? '' : 'opacity-80'}`}>
      <div
        className={`truncate border-b px-3 py-1.5 font-mono text-xs ${
          active
            ? 'border-primary/40 bg-primary/10 text-primary-ink'
            : 'border-border bg-muted/30 text-muted-foreground'
        }`}
      >
        {path}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <ul className="text-sm">
          {parentPath && (
            <li>
              <button
                onClick={() => onNavigate(parentPath)}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted/40"
              >
                <Folder className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">..</span>
              </button>
            </li>
          )}
          {childFolders.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-1 hover:bg-muted/30">
              <Checkbox
                aria-label={`Select folder ${f.slug}`}
                checked={selected.has(`folder:${f.id}`)}
                onCheckedChange={() => onToggleSelect(`folder:${f.id}`)}
              />
              <button
                onDoubleClick={() => onNavigate(f.path)}
                onClick={(e) => {
                  // Single click selects (file-manager muscle memory);
                  // double-click descends.
                  if (e.detail === 1) onToggleSelect(`folder:${f.id}`);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                title={`${f.slug} — double-click to open`}
              >
                <Folder className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">{f.slug}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {f.fileCount} file{f.fileCount === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
          {(filesQuery.data ?? []).map((f) => {
            const d = describeFile(f.mimeType, f.filename);
            const PaneIcon = d.icon;
            return (
              <li key={f.id} className="flex items-center gap-2 px-3 py-1 hover:bg-muted/30">
                <Checkbox
                  aria-label={`Select ${f.filename}`}
                  checked={selected.has(`file:${f.id}`)}
                  onCheckedChange={() => onToggleSelect(`file:${f.id}`)}
                />
                <button
                  onDoubleClick={() => onOpenFile(f.id, path)}
                  onClick={(e) => {
                    if (e.detail === 1) onToggleSelect(`file:${f.id}`);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
                  title={`${f.filename} — double-click to open`}
                >
                  <PaneIcon aria-hidden className={`size-4 shrink-0 ${KIND_TINT[d.kind]}`} />
                  <span className="truncate">{f.filename}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {fmtSize(f.sizeBytes)}
                  </span>
                </button>
              </li>
            );
          })}
          {filesQuery.data && filesQuery.data.length === 0 && childFolders.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">Empty folder</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function FolderTreeRail({
  tree,
  currentPath,
  onNavigate,
  filter,
}: {
  tree: FolderRow[];
  currentPath: string;
  onNavigate: (path: string) => void;
  /** Substring filter over slug/path. Ancestors of a match stay visible so
   *  the result still reads as a tree, not a flat list of orphans. */
  filter?: string;
}) {
  // Sort by path so parents appear before children.
  const sorted = useMemo(() => {
    const all = [...tree].sort((a, b) => a.path.localeCompare(b.path));
    const q = (filter ?? '').toLowerCase();
    if (!q) return all;
    const keep = new Set<string>();
    for (const f of all) {
      if (!f.path.toLowerCase().includes(q) && !f.slug.toLowerCase().includes(q)) continue;
      // The match plus every ancestor path.
      const segs = f.path.split('.');
      for (let i = 1; i <= segs.length; i++) keep.add(segs.slice(0, i).join('.'));
    }
    return all.filter((f) => keep.has(f.path));
  }, [tree, filter]);
  return (
    <ul className="text-sm">
      {sorted.map((f) => {
        const depth = (f.path.match(/\./g) ?? []).length;
        return (
          <li key={f.id} style={{ paddingLeft: depth * 12 }}>
            <Link
              href={`/files?path=${encodeURIComponent(f.path)}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(f.path);
              }}
              className={
                'flex items-center gap-1.5 rounded px-1.5 py-1 ' +
                (f.path === currentPath
                  ? 'bg-primary/10 font-semibold text-primary-ink'
                  : 'hover:bg-muted/40')
              }
              title={f.description || undefined}
            >
              <Folder className="size-3.5 text-muted-foreground" />
              <span className="truncate">{f.path === FILES_ROOT ? 'files' : f.slug}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function defaultBodyFor(ext: TextExt): string {
  if (ext === 'md') return '# Untitled\n\nWrite something.\n';
  if (ext === 'json') return '{\n  \n}\n';
  return '';
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return formatDate(iso);
}
