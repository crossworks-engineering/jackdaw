'use client';

/**
 * `MemberProse` — THE reply-body renderer for both member surfaces (forum
 * posts + team chat), so the dialect they speak cannot drift apart. It is
 * still ReactMarkdown underneath, deliberately: the member dialect is
 * standard Markdown plus exactly three additions, each carried by a small
 * override rather than by porting the owner's TipTap pipeline —
 *
 *  - `![alt](media:<id>)` places a stored picture in the sentence it belongs
 *    to (components/team-media.tsx, shipped v0.4.1);
 *  - `:::info|success|warning|danger` callouts render as tinted blocks — a
 *    warning in a safety answer is content, not decoration;
 *  - `==marked text==` renders as a real highlight.
 *
 * Splitting (lib/member-markdown.ts) is pure and unit-tested; this file is
 * only the styling and the ReactMarkdown wiring.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { mediaMarkdownComponents } from '@/components/team-media';
import type { MediaSurface } from '@/lib/team-media';
import {
  remarkHighlight,
  splitCallouts,
  type CalloutVariant,
  type MemberSegment,
} from '@/lib/member-markdown';

/** Literal class strings per variant — the Tailwind scanner only sees
 *  literals (§11), and each is a status-token TINT under normal foreground
 *  text, which is the safe pattern where a full fill is not (§2). */
const CALLOUT_CLASS: Record<CalloutVariant, string> = {
  info: 'border-info bg-info/10',
  success: 'border-success bg-success/10',
  warning: 'border-warning bg-warning/10',
  danger: 'border-destructive bg-destructive/10',
};

const REMARK_PLUGINS = [remarkGfm, remarkHighlight];

function Segment({ segment, surface }: { segment: MemberSegment; surface: MediaSurface }) {
  const body = (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={mediaMarkdownComponents(surface)}>
      {segment.text}
    </ReactMarkdown>
  );
  if (segment.kind === 'markdown') return body;
  return (
    <div
      // `not-prose` would strip the body's own markdown styling, so the block
      // stays inside the prose flow and only draws the frame.
      className={`rounded-lg border-l-4 px-4 py-3 [&>:first-child]:mt-0 [&>:last-child]:mb-0 ${CALLOUT_CLASS[segment.variant]}`}
      data-callout={segment.variant}
    >
      {body}
    </div>
  );
}

export function MemberProse({ markdown, surface }: { markdown: string; surface: MediaSurface }) {
  const segments = splitCallouts(markdown);
  return (
    <div className="prose prose-accent max-w-none break-words dark:prose-invert [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      {segments.map((s, i) => (
        <Segment key={i} segment={s} surface={surface} />
      ))}
    </div>
  );
}
