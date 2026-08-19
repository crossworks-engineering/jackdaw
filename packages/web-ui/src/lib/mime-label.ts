/**
 * A MIME type, said the way a person would say it.
 *
 * A file listing that prints the raw type shows a member
 * `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
 * where it meant "Word document" — 71 characters that push the name, the size
 * and everything else off the row. This turns the type into a short label and a
 * matching icon, so a listing can carry a real Type column.
 *
 * Two rules decide the tables below.
 *
 * **The extension is the tie-breaker, not the source.** Servers send
 * `application/octet-stream` for anything they do not recognise, and browsers
 * disagree with each other over the office types. So the MIME is asked first,
 * and the filename answers only when the MIME says nothing useful. Neither
 * alone is reliable; in that order they almost always are.
 *
 * **A wrong label is worse than a vague one.** Every fallback walks toward
 * "File" rather than guessing: an unknown type with an extension reads
 * "DWG file", and one without reads "File". Both are honest.
 */
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
  type LucideIcon,
} from 'lucide-react';

/**
 * The families a listing draws differently. Deliberately coarse — this exists
 * to give a row an icon and a word, not to classify a file system.
 */
export type FileKind =
  | 'pdf'
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'text'
  | 'file';

/** Exact MIME matches. Lower-cased and stripped of `; charset=…` before lookup. */
const BY_MIME: Record<string, { kind: FileKind; label: string }> = {
  'application/pdf': { kind: 'pdf', label: 'PDF' },

  'application/msword': { kind: 'word', label: 'Word document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'word',
    label: 'Word document',
  },
  'application/rtf': { kind: 'word', label: 'Rich text' },
  'application/vnd.oasis.opendocument.text': { kind: 'word', label: 'OpenDocument text' },

  'application/vnd.ms-excel': { kind: 'spreadsheet', label: 'Excel workbook' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'spreadsheet',
    label: 'Excel workbook',
  },
  'application/vnd.oasis.opendocument.spreadsheet': {
    kind: 'spreadsheet',
    label: 'OpenDocument sheet',
  },
  'text/csv': { kind: 'spreadsheet', label: 'CSV' },

  'application/vnd.ms-powerpoint': { kind: 'presentation', label: 'PowerPoint' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'presentation',
    label: 'PowerPoint',
  },
  'application/vnd.oasis.opendocument.presentation': {
    kind: 'presentation',
    label: 'OpenDocument slides',
  },

  'application/zip': { kind: 'archive', label: 'ZIP archive' },
  'application/x-zip-compressed': { kind: 'archive', label: 'ZIP archive' },
  'application/gzip': { kind: 'archive', label: 'GZIP archive' },
  'application/x-tar': { kind: 'archive', label: 'TAR archive' },
  'application/x-7z-compressed': { kind: 'archive', label: '7z archive' },
  'application/vnd.rar': { kind: 'archive', label: 'RAR archive' },

  'text/plain': { kind: 'text', label: 'Text' },
  'text/markdown': { kind: 'text', label: 'Markdown' },
  'text/html': { kind: 'code', label: 'HTML' },
  'application/json': { kind: 'code', label: 'JSON' },
  'application/xml': { kind: 'code', label: 'XML' },
  'text/xml': { kind: 'code', label: 'XML' },
};

/**
 * Extension fallbacks, for the `application/octet-stream` case. Only extensions
 * whose label is genuinely better than the generic "XYZ file" are listed —
 * everything else is served fine by that generic form.
 */
const BY_EXTENSION: Record<string, { kind: FileKind; label: string }> = {
  pdf: { kind: 'pdf', label: 'PDF' },
  doc: { kind: 'word', label: 'Word document' },
  docx: { kind: 'word', label: 'Word document' },
  rtf: { kind: 'word', label: 'Rich text' },
  odt: { kind: 'word', label: 'OpenDocument text' },
  xls: { kind: 'spreadsheet', label: 'Excel workbook' },
  xlsx: { kind: 'spreadsheet', label: 'Excel workbook' },
  xlsm: { kind: 'spreadsheet', label: 'Excel workbook' },
  ods: { kind: 'spreadsheet', label: 'OpenDocument sheet' },
  csv: { kind: 'spreadsheet', label: 'CSV' },
  ppt: { kind: 'presentation', label: 'PowerPoint' },
  pptx: { kind: 'presentation', label: 'PowerPoint' },
  odp: { kind: 'presentation', label: 'OpenDocument slides' },
  zip: { kind: 'archive', label: 'ZIP archive' },
  gz: { kind: 'archive', label: 'GZIP archive' },
  tgz: { kind: 'archive', label: 'GZIP archive' },
  tar: { kind: 'archive', label: 'TAR archive' },
  '7z': { kind: 'archive', label: '7z archive' },
  rar: { kind: 'archive', label: 'RAR archive' },
  txt: { kind: 'text', label: 'Text' },
  md: { kind: 'text', label: 'Markdown' },
  json: { kind: 'code', label: 'JSON' },
  xml: { kind: 'code', label: 'XML' },
  html: { kind: 'code', label: 'HTML' },
  htm: { kind: 'code', label: 'HTML' },
};

/** The `image/*`, `video/*`, `audio/*` and `text/*` families, by prefix. */
const BY_PREFIX: { prefix: string; kind: FileKind; suffix: string }[] = [
  { prefix: 'image/', kind: 'image', suffix: 'image' },
  { prefix: 'video/', kind: 'video', suffix: 'video' },
  { prefix: 'audio/', kind: 'audio', suffix: 'audio' },
];

const ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileType,
  word: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  file: FileIcon,
};

/** `report.final.PDF` → `pdf`; a name with no dot → `''`. */
function extensionOf(filename: string | null | undefined): string {
  if (!filename) return '';
  const dot = filename.lastIndexOf('.');
  // A leading dot is a hidden file (`.gitignore`), not an extension.
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * What kind of file this is, and what to call it.
 *
 * Pass both when you have both — the MIME decides, and the filename covers the
 * `application/octet-stream` case that a plain upload almost always produces.
 */
export function describeFile(
  mimeType?: string | null,
  filename?: string | null,
): { kind: FileKind; label: string; icon: LucideIcon } {
  // `text/plain; charset=utf-8` and `TEXT/PLAIN` are the same type.
  const mime = (mimeType ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = extensionOf(filename);

  const exact = BY_MIME[mime];
  if (exact) return { ...exact, icon: ICONS[exact.kind] };

  for (const { prefix, kind, suffix } of BY_PREFIX) {
    if (!mime.startsWith(prefix)) continue;
    // `image/png` → "PNG image". The subtype is the informative half, and a
    // `+xml` or `vnd.` decoration on it is noise to a reader.
    const sub = mime
      .slice(prefix.length)
      .replace(/^(x-|vnd\.)/, '')
      .replace(/\+.*$/, '');
    const named = sub && sub.length <= 5 ? `${sub.toUpperCase()} ${suffix}` : suffix;
    return { kind, label: named.charAt(0).toUpperCase() + named.slice(1), icon: ICONS[kind] };
  }

  const byExt = BY_EXTENSION[ext];
  if (byExt) return { ...byExt, icon: ICONS[byExt.kind] };

  // `text/*` that is not in the tables is still readable text.
  if (mime.startsWith('text/')) return { kind: 'text', label: 'Text', icon: ICONS.text };

  // Honest fallbacks: name the extension if there is one, otherwise say nothing
  // more than "File". Never guess from a MIME we do not recognise.
  if (ext && ext.length <= 5) {
    return { kind: 'file', label: `${ext.toUpperCase()} file`, icon: ICONS.file };
  }
  return { kind: 'file', label: 'File', icon: ICONS.file };
}

/** Just the label, for callers that draw their own icon (or none). */
export function fileTypeLabel(mimeType?: string | null, filename?: string | null): string {
  return describeFile(mimeType, filename).label;
}
