'use client';

/**
 * The Files screen's layout pieces: the child-folder strip, the dual pane and its file pane, and the folder tree rail.
 *
 * Moved out of files-client.tsx unchanged (structure pass, phase 1):
 * already standalone, just living in the wrong file. No signatures changed.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { Folder } from 'lucide-react';
import { KIND_TINT, describeFile } from '@mantle/web-ui/lib/mime-label';
import { Button } from '@mantle/web-ui/ui/button';
import { ListCard, ListCardMeta, ListCardTitle } from '@mantle/web-ui/ui/list-card';
import { Checkbox } from '@mantle/web-ui/ui/checkbox';
import { useToast } from '@mantle/web-ui/ui/toast';
import { FILES_ROOT, fmtSize } from './files-shared';
import type { FileRow, FolderRow } from './files-shared';

export function ChildFolders({
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
export function DualPane({
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
export function FilePane({
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
    // Own namespace, NOT ['files','list',…]: the outer folder view caches the
    // {files} ENVELOPE under that key while this pane caches the bare array —
    // sharing the key hands one component the other's shape and `.map`
    // explodes on the envelope. Same-shape-or-separate-key is the rule; the
    // ['files'] prefix keeps it inside the invalidation blast radius.
    queryKey: ['files', 'pane', path],
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
                <Folder className="size-4 shrink-0 text-warning-ink" />
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

export function FolderTreeRail({
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
