/**
 * More than one attachment per chat turn, without widening the turn route.
 *
 * The turn carries ONE inline attachment: the server reads it before the model
 * runs (question-aware vision for an image, parsed text for a document), which
 * is the fast, high-fidelity path and stays exactly as it was. Every file BEYOND
 * the first takes the road the brain already has for "use these things": it is
 * uploaded as a normal file node into the chat-uploads folder and LINKED to the
 * turn as picked context (the same refs the marker tool makes), and the agent
 * opens it with its file tools if and when it needs it. No new contract.
 *
 * The one catch is readiness. `file_read` serves a text file's bytes at once and
 * `extract_from_image` reads an image's bytes at once, but for an office
 * document it returns the text the EXTRACTOR parsed, which does not exist until
 * ingest has run. So those wait for the node to report an applied index before
 * they are linked; see `needsIndexWait`.
 */
import { apiFetch, ApiError } from '@mantle/web-ui/api-fetch';

/** Server twin: `ASSISTANT_UPLOADS_SLUG` + `ensureDatedUploadFolder`. The inline
 *  attachment lands in the same dated folder, so one day's chat files sit
 *  together whichever road they took. */
export const CHAT_UPLOADS_SLUG = 'assistant-uploads';

/** ltree labels use underscores where slugs use dashes (server: `dashToLtree`). */
const dashToLtree = (slug: string) => slug.replace(/-/g, '_');

export type ChatUploadFolder = {
  /** Folders to ensure, parent first: `[parentPath, slug, description]`. */
  ensure: ReadonlyArray<readonly [parentPath: string, slug: string, description: string]>;
  /** The ltree path files are uploaded into. */
  path: string;
};

/** Where today's chat uploads go. The date is UTC, as on the server, so the two
 *  roads agree on the folder even across the local-midnight boundary. */
export function chatUploadFolder(now: Date): ChatUploadFolder {
  const dateSlug = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const top = `files.${dashToLtree(CHAT_UPLOADS_SLUG)}`;
  return {
    ensure: [
      ['files', CHAT_UPLOADS_SLUG, 'Files uploaded through the /assistant chat. Auto-created.'],
      [top, dateSlug, `Uploads from ${dateSlug}.`],
    ],
    path: `${top}.${dashToLtree(dateSlug)}`,
  };
}

/** Extensions whose readable text only exists after the extractor has run. */
const EXTRACTOR_PARSED = ['.pdf', '.docx', '.xlsx', '.xls'];

/** Must this file finish indexing before an agent can read it? */
export function needsIndexWait(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('image/')) return false;
  const name = file.name.toLowerCase();
  return EXTRACTOR_PARSED.some((ext) => name.endsWith(ext));
}

export type AttachmentPlan<F> = {
  /** Takes the inline slot (null when it was already taken, or nothing came). */
  inline: F | null;
  /** Upload + link as context. */
  linked: F[];
  /** Over the context cap: not attached. */
  overflow: F[];
};

/**
 * Split incoming files between the one inline slot and linked context.
 *
 * @param hasInline      the inline slot is already taken
 * @param contextCount   context refs already riding the next turn
 * @param pendingLinked  linked uploads still in flight (they will take slots)
 * @param maxContext     the dock's cap on context refs
 */
export function planAttachments<F>(
  files: readonly F[],
  opts: { hasInline: boolean; contextCount: number; pendingLinked: number; maxContext: number },
): AttachmentPlan<F> {
  const rest = [...files];
  const inline = !opts.hasInline && rest.length > 0 ? rest.shift()! : null;
  const room = Math.max(0, opts.maxContext - opts.contextCount - opts.pendingLinked);
  return { inline, linked: rest.slice(0, room), overflow: rest.slice(room) };
}

type FileRow = {
  id: string;
  filename: string;
  indexingApplied: 'full' | 'metadata' | null;
};

/**
 * Create today's folder pair if missing. "Already there" is the normal case
 * after the first upload of the day: the route answers 409 for it, but an older
 * brain (or a differently worded driver error) can answer 400, so both pass. The
 * upload that follows is the real test: if the folder truly is missing, IT fails,
 * with the server's own message.
 */
export async function ensureChatUploadFolder(now: Date = new Date()): Promise<string> {
  const folder = chatUploadFolder(now);
  for (const [parentPath, slug, description] of folder.ensure) {
    try {
      await apiFetch('/api/files/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentPath, slug, description }),
      });
    } catch (err) {
      if (!(err instanceof ApiError) || (err.status !== 409 && err.status !== 400)) throw err;
    }
  }
  return folder.path;
}

/** Upload one file into the chat-uploads folder; returns its file node. */
export async function uploadChatFile(file: File, parentPath: string): Promise<FileRow> {
  const fd = new FormData();
  fd.set('parentPath', parentPath);
  fd.set('file', file);
  // FormData body: apiFetch (not apiSend) so the multipart boundary survives.
  const { file: row } = await apiFetch<{ file: FileRow }>('/api/files/files', {
    method: 'POST',
    body: fd,
  });
  return row;
}

export const INDEX_WAIT_POLL_MS = 2000;
export const INDEX_WAIT_TIMEOUT_MS = 90_000;

/**
 * Wait until the extractor has run for this file, so `file_read` has text to
 * return. Resolves `true` when indexed, `false` on timeout: the caller links the
 * file anyway (the agent can retry the read, and a scanned PDF never gets text),
 * but can say so. Injectable for tests.
 */
export async function waitUntilIndexed(
  fileId: string,
  opts: {
    fetchRow?: (id: string) => Promise<FileRow | null>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
    pollMs?: number;
    isCancelled?: () => boolean;
  } = {},
): Promise<boolean> {
  const fetchRow =
    opts.fetchRow ??
    (async (id: string) =>
      (await apiFetch<{ file: FileRow }>(`/api/files/files/${id}`, { cache: 'no-store' })).file);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.timeoutMs ?? INDEX_WAIT_TIMEOUT_MS);
  for (;;) {
    if (opts.isCancelled?.()) return false;
    try {
      const row = await fetchRow(fileId);
      if (row?.indexingApplied) return true;
    } catch {
      /* transient: try again */
    }
    if (now() >= deadline) return false;
    await sleep(opts.pollMs ?? INDEX_WAIT_POLL_MS);
  }
}
