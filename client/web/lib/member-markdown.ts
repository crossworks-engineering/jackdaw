/**
 * The member dialect's two additions to standard Markdown — callouts and
 * `==highlight==` — as PURE text/tree transforms, so they are unit-testable in
 * a suite with no React renderer (the same split lib/team-media.ts made).
 *
 * Deliberately NOT the owner's route. The owner assistant renders through
 * TipTap + `lib/rich-markdown.ts`, which brings columns, mentions and the
 * whole page schema with it. The member surfaces stay on ReactMarkdown and
 * close the gap construct-by-construct, keeping only what carries INFORMATION
 * a member needs: a `:::warning` in a safety answer is content, not
 * decoration, and rendering it as literal `:::` lines buries the one line the
 * reply exists to deliver. Columns are skipped on purpose (a two-column
 * layout in a thread pane is worse than one column) and so are colour spans
 * (colour alone carries no meaning to a reader who cannot see it).
 *
 * `docs/plans/team-forum-cards.md` §5 is the decision record.
 */

export const CALLOUT_VARIANTS = ['info', 'success', 'warning', 'danger'] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export type MemberSegment =
  { kind: 'markdown'; text: string } | { kind: 'callout'; variant: CalloutVariant; text: string };

const OPEN_RE = /^:::(info|success|warning|danger)\s*$/;
const CLOSE_RE = /^:::\s*$/;
const FENCE_RE = /^(```|~~~)/;

/**
 * Split a reply into markdown runs and callout blocks — the same top-level
 * line walk `rich-markdown.ts` does, because the container isn't markdown and
 * remark tokenizes its `:::` lines as ordinary paragraph text.
 *
 * Rules, matching the owner converter's v1:
 * - Openers/closers sit at line start (an INDENTED `:::` is markdown's own
 *   business — four spaces is a code block) and outside code fences.
 * - No nesting: the first `:::` line inside a callout closes it.
 * - An UNCLOSED opener is not a callout: the walk emits it back as plain
 *   text. This is what a mid-stream render sees while the closing `:::` has
 *   not arrived yet — the raw marker for a moment, never a half-open box
 *   swallowing the rest of the reply.
 */
export function splitCallouts(markdown: string): MemberSegment[] {
  const lines = markdown.split('\n');
  const segments: MemberSegment[] = [];
  let run: string[] = [];
  let inFence = false;

  const flushRun = () => {
    const text = run.join('\n');
    if (text.trim()) segments.push({ kind: 'markdown', text });
    run = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      run.push(line);
      continue;
    }
    const open = inFence ? null : OPEN_RE.exec(line);
    if (!open) {
      run.push(line);
      continue;
    }
    // Scan for the closer; fences inside a callout body still guard it.
    const body: string[] = [];
    let bodyFence = false;
    let closed = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const inner = lines[j]!;
      if (FENCE_RE.test(inner)) bodyFence = !bodyFence;
      else if (!bodyFence && CLOSE_RE.test(inner)) {
        closed = j;
        break;
      }
      body.push(inner);
    }
    if (closed === -1) {
      // Unclosed — the opener was just a line of text after all.
      run.push(line);
      continue;
    }
    flushRun();
    segments.push({
      kind: 'callout',
      variant: open[1] as CalloutVariant,
      text: body.join('\n'),
    });
    i = closed;
  }
  flushRun();
  return segments;
}

/** The minimal structural slice of mdast this file walks. */
type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
};

// The owner tokenizer's own pattern: non-space against both markers, so a
// literal `==` in prose (or `a == b`) never triggers.
const HIGHLIGHT_RE = /==(?=\S)([\s\S]*?\S)==/g;

/**
 * remark plugin: `==marked text==` → `<mark>`.
 *
 * Runs AFTER remark's own inline tokenization, so it only ever sees plain
 * `text` nodes — code spans and fenced blocks are already their own node
 * types and are never entered, which is the safety the owner converter gets
 * from marked's tokenizer ordering. The one divergence from the owner: a
 * marker pair spanning other formatting (`==a **b**==`) lands in separate
 * text nodes and stays literal — the plain case is what replies actually use.
 */
export function remarkHighlight() {
  return (tree: unknown) => walkHighlight(tree as MdNode);
}

function walkHighlight(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type !== 'text' || !child.value || !HIGHLIGHT_RE.test(child.value)) {
      walkHighlight(child);
      next.push(child);
      continue;
    }
    HIGHLIGHT_RE.lastIndex = 0;
    let cursor = 0;
    for (const m of child.value.matchAll(HIGHLIGHT_RE)) {
      if (m.index! > cursor) next.push({ type: 'text', value: child.value.slice(cursor, m.index) });
      // `emphasis` is a node type every mdast→hast handler knows; `hName`
      // swaps the rendered tag. An unknown custom type would throw instead.
      next.push({
        type: 'emphasis',
        data: { hName: 'mark' },
        children: [{ type: 'text', value: m[1]! }],
      });
      cursor = m.index! + m[0].length;
    }
    if (cursor < child.value.length) next.push({ type: 'text', value: child.value.slice(cursor) });
  }
  node.children = next;
}
