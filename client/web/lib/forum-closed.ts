/**
 * The team forum is closed and its portal retired (member logins, Phase 6).
 * Its tables stay until a later stage, and until then the brain still offers
 * the export (POST /api/team-admin/forum/export) that turns every topic into
 * an admin-level "Forum archive" page. The Team admin banner is the one
 * caller.
 *
 * Pure helpers only, so the banner and the tests share one reading of the
 * wire shapes.
 */

export const FORUM_CLOSED_TEXT = 'The forum is closed. Members use their own logins now.';

function reasonOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null
    ? (body as { reason?: unknown }).reason
    : undefined;
}

/** GET /api/team-admin/forum/export */
export type ForumExportCount = { unexported: number };

/** POST /api/team-admin/forum/export, 200. */
export type ForumExportResult = {
  status: 'done';
  /** Topics given a page by this run. */
  exported: number;
  /** Topics left for a later run (an agent reply still in flight). */
  deferred: number;
  /** Topics already exported before this run. */
  alreadyExported: number;
  /** The "Forum archive" parent page, null when nothing was ever exported. */
  archivePageId: string | null;
  dumpFileId: string | null;
  /** Unreviewed uploads filed into files/review/forum-archive. */
  uploadsFiled: number;
  /** Unreviewed uploads whose bytes were gone. */
  uploadsMissing: number;
  /** Request tasks linked to their topic's archive page. */
  tasksLinked: number;
};

/** Is this the export's 409 "another run holds the lock"? */
export function isExportBusy(status: number, body: unknown): boolean {
  return status === 409 && reasonOf(body) === 'busy';
}

export const EXPORT_BUSY_TEXT = 'The export is already running. Try again in a minute.';

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One line saying what an export run did, for the admin's banner. */
export function exportResultText(r: ForumExportResult): string {
  const parts: string[] = [];
  if (r.exported > 0) {
    parts.push(`Exported ${count(r.exported, 'topic')} to Pages.`);
    if (r.alreadyExported > 0) {
      parts.push(`${count(r.alreadyExported, 'was', 'were')} already there.`);
    }
  } else if (r.alreadyExported > 0) {
    parts.push(
      `Nothing new to export: ${count(r.alreadyExported, 'topic is', 'topics are')} already in the archive.`,
    );
  } else if (r.deferred === 0) {
    parts.push('The forum has no topics to export.');
  }
  if (r.deferred > 0) {
    parts.push(
      `${count(r.deferred, 'topic waits', 'topics wait')} for a reply still in progress; export again later.`,
    );
  }
  if (r.uploadsFiled > 0) {
    parts.push(`Filed ${count(r.uploadsFiled, 'unreviewed upload')} into files/review.`);
  }
  if (r.uploadsMissing > 0) {
    parts.push(`${count(r.uploadsMissing, 'upload')} had no file left to keep.`);
  }
  if (r.tasksLinked > 0) {
    parts.push(`Linked ${count(r.tasksLinked, 'request task')} to the archive.`);
  }
  return parts.join(' ');
}

/** The count line beside the Export button. */
export function unexportedText(unexported: number): string {
  return unexported > 0
    ? `${count(unexported, 'topic is', 'topics are')} not in the Forum archive yet.`
    : 'Every topic is in the Forum archive.';
}
