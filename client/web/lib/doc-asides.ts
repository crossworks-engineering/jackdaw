/**
 * Starlight asides in the docs reader.
 *
 * The guide in mantle `docs/guide/` is published by Starlight
 * (docs.mantle-ai.tech), which turns a fenced block like
 *
 *     :::note[What OpenRouter is for]
 *     Body markdown.
 *     :::
 *
 * into a callout box. Plain react-markdown shows the fences as text. This file
 * gives the reader the same four kinds (`note`, `tip`, `caution`, `danger`)
 * without a directive parser: generic `:text` directives would also swallow
 * ordinary prose like `a:b`, so only the container form is recognised.
 *
 * Two steps, both pure:
 *  1. `padAsideFences` puts blank lines around each fence line (outside code
 *     fences), so every fence parses as a paragraph of its own. Without it the
 *     opening line and the first body line share one paragraph.
 *  2. `remarkAsides` folds the nodes between a matched open and close fence
 *     into one `aside` element carrying the kind and title as data attributes.
 *     An open fence with no close stays literal text, as it was before.
 */

export const ASIDE_TYPES = ['note', 'tip', 'caution', 'danger'] as const;
export type AsideType = (typeof ASIDE_TYPES)[number];

export const ASIDE_DEFAULT_TITLES: Record<AsideType, string> = {
  note: 'Note',
  tip: 'Tip',
  caution: 'Caution',
  danger: 'Danger',
};

// `:::kind`, an optional `[Title]`, optional `{attrs}` (ignored), nothing else.
const OPEN_RE = /^:::(note|tip|caution|danger)(?:\[([^\]\n]*)\])?(?:\{[^}\n]*\})?\s*$/;
const CLOSE_RE = /^:::\s*$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})\s*$/;

export function isAsideType(v: unknown): v is AsideType {
  return typeof v === 'string' && (ASIDE_TYPES as readonly string[]).includes(v);
}

/** Step 1: blank lines around aside fence lines, leaving code fences alone. */
export function padAsideFences(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let depth = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      const marker = FENCE_CLOSE_RE.exec(line)?.[1] ?? '';
      if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    const open = FENCE_OPEN_RE.exec(line)?.[1];
    if (open) {
      fence = open;
      out.push(line);
    } else if (OPEN_RE.test(line)) {
      depth++;
      out.push('', line, '');
    } else if (depth > 0 && CLOSE_RE.test(line)) {
      depth--;
      out.push('', line.trim(), '');
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

// The few mdast shapes this needs, typed locally (no @types/mdast dependency).
type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

function plainText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(plainText).join('');
}

function openFence(node: MdNode): { type: AsideType; title: string } | null {
  if (node.type !== 'paragraph') return null;
  const m = OPEN_RE.exec(plainText(node).trim());
  if (!m || !isAsideType(m[1])) return null;
  const title = (m[2] ?? '').trim() || ASIDE_DEFAULT_TITLES[m[1]];
  return { type: m[1], title };
}

function isCloseFence(node: MdNode): boolean {
  return node.type === 'paragraph' && CLOSE_RE.test(plainText(node).trim());
}

function fold(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i] as MdNode;
    const open = openFence(node);
    if (!open) {
      out.push(node);
      continue;
    }
    // Find the matching close, counting nested opens.
    let depth = 1;
    let end = -1;
    for (let j = i + 1; j < children.length; j++) {
      const next = children[j] as MdNode;
      if (openFence(next)) depth++;
      else if (isCloseFence(next) && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) {
      out.push(node); // unclosed: leave it literal
      continue;
    }
    out.push({
      type: 'docAside',
      children: fold(children.slice(i + 1, end)),
      data: {
        hName: 'aside',
        hProperties: { dataAsideType: open.type, dataAsideTitle: open.title },
      },
    });
    i = end;
  }
  return out;
}

/** Step 2: the remark plugin. Pair with `padAsideFences` on the source. */
export function remarkAsides() {
  return (tree: MdNode) => {
    if (tree.children) tree.children = fold(tree.children);
  };
}
