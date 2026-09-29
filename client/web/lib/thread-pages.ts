/**
 * Comment threads are read a page at a time (client logins C5 audit fixes,
 * contract section 1): the brain answers the NEWEST 100 comments, oldest
 * first, with `hasMore` when older ones exist, and `?before=<createdAt of the
 * oldest shown>` answers the 100 before that. A brain before the fix answers
 * the whole thread and no `hasMore`, which reads as one page.
 *
 * The pure half, pinned by thread-pages.test.ts; the hook that reads a
 * thread this way is use-thread-pages.ts.
 */
import type { CommentThreadPage } from './contract-next';

/** One page of a thread: the newest without `before`, else the page older
 *  than it. */
export function threadPagePath(path: string, before?: string | null): string {
  if (!before) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}before=${encodeURIComponent(before)}`;
}

/** Where the page older than this one starts: its oldest comment's
 *  `createdAt`, when the brain says there is more. Undefined: this is the
 *  oldest page. */
export function olderCursor<C extends { createdAt: string }>(
  page: CommentThreadPage<C>,
): string | undefined {
  if (page.hasMore !== true) return undefined;
  return page.comments[0]?.createdAt;
}

/**
 * The thread as one list, oldest first, from its pages in the order they
 * were read (the newest page first, each older one after). A comment that
 * shows in two pages (a thread that moved between two reads) shows once.
 */
export function threadComments<C extends { id: string }>(
  pages: readonly CommentThreadPage<C>[],
): C[] {
  const seen = new Set<string>();
  const out: C[] = [];
  for (let i = pages.length - 1; i >= 0; i--) {
    for (const c of pages[i]!.comments) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}
