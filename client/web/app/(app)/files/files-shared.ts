/**
 * The pure layer behind the Files screen: the row shapes, the small format and slug helpers, and the derived-count arithmetic.
 *
 * Moved out of files-client.tsx unchanged (structure pass, phase 1):
 * already standalone, just living in the wrong file. No signatures changed.
 */

import { formatDate } from '@mantle/web-ui/lib/format-datetime';

export const FILES_ROOT = 'files';

export type FolderRow = {
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

export type FileRow = {
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
export type FileSearchHit = {
  id: string;
  type: string;
  title: string;
  path: string;
  summary: string | null;
  updatedAt: string;
};

export type TextExt = 'md' | 'txt' | 'json';

/** Server-shaped counts of the nodes ingest derived from a file — mirrors
 *  DerivedCounts in @mantle/files (the client bundle can't import it). */
export type DerivedCounts = {
  images: number;
  tables: number;
  pages: number;
  notes: number;
  other: number;
  total: number;
};

export type BulkDeleteResponse = {
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

/** What the rename dialog is acting on — a file (stem, extension preserved) or
 *  a folder (slug). */
export type RenameTarget =
  | { kind: 'file'; id: string; filename: string; extension: string }
  | { kind: 'folder'; id: string; slug: string };

export function sumDerivedCounts(all: DerivedCounts[]): DerivedCounts {
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
export function describeDerivedCounts(c: DerivedCounts): string {
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
export function slugify(input: string): string {
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
export function effectiveFolderIndexing(
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

export function defaultBodyFor(ext: TextExt): string {
  if (ext === 'md') return '# Untitled\n\nWrite something.\n';
  if (ext === 'json') return '{\n  \n}\n';
  return '';
}

export function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return formatDate(iso);
}
