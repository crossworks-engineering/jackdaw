/**
 * Folder upload: a picked or dropped folder, sub-folders and all, mirrored
 * into the brain's Files tree. Frontend only: the brain uploads one file into
 * one EXISTING folder, so the client makes each missing folder first, parents
 * before children, then hands each folder's files to the upload dock.
 *
 * The brain's rules this mirrors (packages/files in mantle):
 *   - a folder's path label is its slug with dashes as underscores;
 *   - folders nest at most FILES_MAX_FOLDER_DEPTH deep under `files`, and a
 *     deeper chain lands in its third folder (`clampFilesFolderPath`).
 */

/** One file with its path inside what was picked, top folder first:
 *  `photos/2024/a.jpg`. A loose file dropped beside folders is just `a.txt`. */
export type TreeFile = { file: File; relPath: string };

/** A folder to make: POST /api/files/folders { parentPath, slug } → `path`. */
export type FolderStep = { parentPath: string; slug: string; path: string };

export type FolderUploadPlan = {
  /** Every folder the files need, parents before children. */
  folders: FolderStep[];
  /** The files, grouped by the folder they land in. */
  batches: { parentPath: string; files: File[] }[];
  fileCount: number;
  /** Hidden and system files left out (`.git/…`, `.DS_Store`, `Thumbs.db`). */
  skipped: number;
  /** Files nested deeper than the folder limit, put in the deepest folder. */
  flattened: number;
};

/** Mirrors the brain's FILES_MAX_FOLDER_DEPTH. */
export const FILES_MAX_FOLDER_DEPTH = 3;

const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini']);

/** As the brain's `slugifyFolder`: lowercase, runs of anything but
 *  [a-z0-9] become one dash, trimmed, 64 at most. */
export function folderSlug(name: string): string | null {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (s) return s;
  // No Latin letters or digits (Cyrillic, CJK, emoji): a short stable slug
  // from the text, so the same folder uploaded twice lands in one place.
  const text = name.trim().normalize('NFC');
  return text ? `f-${fnv1a(text)}` : null;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Folders below `files` in an ltree path: `files` 0, `files.a.b` 2. */
function depthOf(path: string): number {
  return path.split('.').length - 1;
}

/** Is this path segment hidden or a system file nobody means to upload? */
function isJunk(segment: string): boolean {
  return segment.startsWith('.') || SYSTEM_FILES.has(segment.toLowerCase());
}

export function planFolderUpload(items: TreeFile[], basePath: string): FolderUploadPlan {
  const room = Math.max(0, FILES_MAX_FOLDER_DEPTH - depthOf(basePath));
  const folders = new Map<string, FolderStep>();
  const batches = new Map<string, File[]>();
  let skipped = 0;
  let flattened = 0;
  let fileCount = 0;

  for (const { file, relPath } of items) {
    const segments = relPath.split('/').filter(Boolean);
    if (segments.length === 0 || segments.some(isJunk)) {
      skipped++;
      continue;
    }
    const dirs = segments.slice(0, -1);
    if (dirs.length > room) flattened++;

    let parentPath = basePath;
    for (const dir of dirs.slice(0, room)) {
      const slug = folderSlug(dir);
      if (!slug) continue;
      const path = `${parentPath}.${slug.replace(/-/g, '_')}`;
      if (!folders.has(path)) folders.set(path, { parentPath, slug, path });
      parentPath = path;
    }
    const batch = batches.get(parentPath);
    if (batch) batch.push(file);
    else batches.set(parentPath, [file]);
    fileCount++;
  }

  return {
    // Insertion order already puts a parent before its children.
    folders: [...folders.values()],
    batches: [...batches].map(([parentPath, files]) => ({ parentPath, files })),
    fileCount,
    skipped,
    flattened,
  };
}

/** The folder picker's files (`<input webkitdirectory>`) as tree files. */
export function pickedTreeFiles(list: FileList | File[]): TreeFile[] {
  return Array.from(list).map((file) => ({
    file,
    relPath: file.webkitRelativePath || file.name,
  }));
}

/**
 * Read a drop that holds at least one folder; null when it holds only files
 * (the plain upload handles those). The entries must be taken while the drop
 * event runs, so call this synchronously from the handler and await after.
 */
export function droppedTree(items: DataTransferItemList): Promise<TreeFile[]> | null {
  const entries = Array.from(items)
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (!entries.some((e) => e.isDirectory)) return null;
  return Promise.all(entries.map(walk)).then((lists) => lists.flat());
}

async function walk(entry: FileSystemEntry): Promise<TreeFile[]> {
  const relPath = entry.fullPath.replace(/^\/+/, '');
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [{ file, relPath }];
  }
  if (isJunk(entry.name)) return []; // never read a .git tree just to skip it
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries answers in batches (about 100 in Chromium) until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  const lists = await Promise.all(children.map(walk));
  return lists.flat();
}

/** The one line after a folder upload starts, or null when nothing to say. */
export function folderUploadNotice(plan: FolderUploadPlan): string | null {
  const parts: string[] = [];
  if (plan.flattened > 0) {
    parts.push(
      `${plan.flattened} file${plan.flattened === 1 ? '' : 's'} nested deeper than ${FILES_MAX_FOLDER_DEPTH} folders went into the deepest folder.`,
    );
  }
  if (plan.skipped > 0) {
    parts.push(
      `${plan.skipped} hidden or system file${plan.skipped === 1 ? ' was' : 's were'} left out.`,
    );
  }
  return parts.length ? parts.join(' ') : null;
}
