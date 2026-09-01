import { markdownToDoc } from '@mantle/content-core/markdown';
import {
  parseRecallDoc,
  recallOptionsMarkdown,
  recallSlug,
  RECALL_BODY_CHAR_BUDGET,
  RECALL_TAG,
  RECALL_PROMPT_TAG,
  type RecallLintIssue,
} from '@mantle/content-core/recall-compile';

/**
 * Doc plumbing shared by every owner-side Recall author path: the routing
 * editor and the guided create dialog.
 *
 * The rule this file exists to hold: a Recall page is an ORDINARY page whose
 * shape happens to satisfy the compiler. So every writer here composes
 * markdown, runs it through the same `markdownToDoc` the editor uses, and
 * hands the result to the normal page create/commit routes. Nothing writes a
 * serving row, and nothing hand-rolls the `## Options` convention.
 * `recallOptionsMarkdown` (content-core) is the one writer, so human- and
 * agent-authored options stay byte-identical.
 */

export { RECALL_BODY_CHAR_BUDGET, RECALL_TAG, RECALL_PROMPT_TAG, recallSlug };
export type { RecallLintIssue };

export type PageDoc = { type?: string; content?: unknown[] };

/** What the compiler will call this page. Mirrors `recallSlug` exactly so the
 *  create dialog can show the slug an author is about to get. Collisions are
 *  resolved server-side at compile (`assignRecallSlugs`), so this is a
 *  preview, not a promise, and the dialog says so. */
export function slugPreview(title: string): string {
  return recallSlug(title.trim() || 'Untitled');
}

/** Heading test mirrored from recall-compile's parser: any level, text "options". */
export function isOptionsHeading(node: unknown): boolean {
  const n = node as { type?: string; content?: unknown[] };
  return n?.type === 'heading' && inlineText(n).trim().toLowerCase() === 'options';
}

export function inlineText(node: {
  type?: string;
  text?: string;
  attrs?: { label?: unknown };
  content?: unknown[];
}): string {
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
  if (node.type === 'mention') return typeof node.attrs?.label === 'string' ? node.attrs.label : '';
  if (node.type === 'hardBreak') return ' ';
  return ((node.content ?? []) as Parameters<typeof inlineText>[0][]).map(inlineText).join('');
}

/**
 * Replace the trailing Options section: keep every body node BEFORE the LAST
 * "Options" heading exactly as committed (no markdown round-trip of the body,
 * so rich content stays untouched), then append the canonical section from
 * `recallOptionsMarkdown`. An empty options list removes the section.
 */
export function withOptionsSection(
  doc: PageDoc,
  options: { label: string; useWhen: string; targetPageId: string }[],
): PageDoc {
  const content = Array.isArray(doc.content) ? doc.content : [];
  let headingAt = -1;
  for (let i = 0; i < content.length; i++) {
    if (isOptionsHeading(content[i])) headingAt = i;
  }
  const body = headingAt === -1 ? content : content.slice(0, headingAt);
  const md = recallOptionsMarkdown(options);
  const section = md ? ((markdownToDoc(md) as PageDoc).content ?? []) : [];
  return { type: 'doc', content: [...body, ...section] };
}

/**
 * Add ONE option to a page that may already have some.
 *
 * `withOptionsSection` replaces the whole section, so appending means reading
 * the current options back out first, through `parseRecallDoc`: the same
 * parser the compiler uses, so an option written by hand, by the routing
 * editor, or by an agent all round-trip identically. This is what lets the
 * create dialog wire a new child into its parent without the author ever
 * seeing the `## Options` convention.
 */
export function withAppendedOption(
  doc: PageDoc,
  option: { label: string; useWhen: string; targetPageId: string },
): PageDoc {
  const existing = parseRecallDoc(doc).options ?? [];
  return withOptionsSection(doc, [
    ...existing,
    { ...option, useWhen: stripUseWhenPrefix(option.useWhen) },
  ]);
}

/**
 * Compose a Recall page body from the guided fields.
 *
 * `useWhen` becomes the LEADING paragraph in the exact form the compiler's
 * `USE_WHEN_RE` accepts: a "Use when" prefix, then any of colon, dash or
 * space. It must also land inside the first three blocks, and being first is
 * the simplest way to guarantee that.
 * Options are appended by the caller through `withOptionsSection`, never
 * written here, so there is one options writer and not two.
 */
export function buildRecallDoc({ useWhen, body }: { useWhen?: string; body?: string }): PageDoc {
  const parts: string[] = [];
  const when = useWhen?.trim();
  if (when) parts.push(`Use when: ${stripUseWhenPrefix(when)}`);
  const text = body?.trim();
  if (text) parts.push(text);
  // An empty page is legal (a stub the author fills in the editor); the
  // preflight below is what tells them whether it will compile.
  return markdownToDoc(parts.join('\n\n')) as PageDoc;
}

/** Tolerate an author who types the prefix themselves. "Use when: use when x"
 *  reads badly and the compiler would keep both. */
export function stripUseWhenPrefix(value: string): string {
  return value.replace(/^use when\b[:\s—–-]*/i, '').trim();
}

/** Prepend the `Use when:` paragraph to an already-committed doc, for the
 *  "make this page a prompt" conversion. Leaves the rest of the doc alone. */
export function withUseWhenParagraph(doc: PageDoc, useWhen: string): PageDoc {
  const content = Array.isArray(doc.content) ? doc.content : [];
  const para = (markdownToDoc(`Use when: ${stripUseWhenPrefix(useWhen)}`) as PageDoc).content ?? [];
  return { type: 'doc', content: [...para, ...content] };
}

/** The declared "Use when: …" line, or null when the page has none. Read
 *  through the compiler's own parser, so "has one" here means exactly what it
 *  means at compile time, including the three-block window it must sit in. */
export function readUseWhen(doc: PageDoc): string | null {
  return parseRecallDoc(doc).useWhen;
}

export type Preflight = {
  ok: boolean;
  errors: RecallLintIssue[];
  warnings: RecallLintIssue[];
  /** Body size against the 6,000-char budget, so the dialog can show a meter
   *  BEFORE the author is over it rather than only complaining after. */
  bodyChars: number;
};

/**
 * Run the REAL compiler lint over a draft doc, in the browser.
 *
 * `parseRecallDoc` is pure (no DB, never throws), which is what makes a live
 * preflight honest: the dialog shows the same issues the server-side compile
 * would raise, from the same code. It covers the per-DOC rules only. The
 * tree-level ones (`index-no-options`, `target-outside-map`, `orphan-node`)
 * need the whole map and are checked by the caller, which knows it.
 */
export function preflight(doc: PageDoc, opts: { isPrompt?: boolean } = {}): Preflight {
  const parsed = parseRecallDoc(doc, { isPrompt: opts.isPrompt });
  const errors = parsed.issues.filter((i) => i.severity === 'error');
  const warnings = parsed.issues.filter((i) => i.severity === 'warning');
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    bodyChars: parsed.bodyMarkdown.length,
  };
}
