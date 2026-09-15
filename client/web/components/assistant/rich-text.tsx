'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { StaticDoc } from '@/components/page-editor/static-doc';
import { richMarkdownToHtml } from '@/lib/rich-markdown';

/**
 * Render Saskia's settled reply as a rich document, through the SAME TipTap
 * schema the Pages surface uses. Her markdown dialect (callouts, columns, task
 * lists, tables, highlights — see `lib/rich-markdown.ts`) is converted to HTML,
 * normalised through the schema, and emitted as STATIC markup, so chat output
 * renders identically to a page and picks up the shared ProseMirror CSS in
 * globals.css.
 *
 * It used to be one read-only TipTap EDITOR per turn — which is how a 25-turn
 * thread came to hold 25 ProseMirror views, their plugin stacks, and a React
 * NodeView for every callout and embed inside them, none of which anyone could
 * type into. A settled reply never changes; the only thing the editor was
 * buying was the schema's own rendering, and `StaticDoc` calls that directly.
 *
 * The live streaming buffer above a turn is a different render entirely
 * (`STREAM_MARKDOWN_COMPONENTS`) and is untouched by this.
 */
export function RichText({ markdown }: { markdown: string }) {
  const router = useRouter();
  const html = useMemo(() => richMarkdownToHtml(markdown), [markdown]);

  // The shared page extensions set `link.openOnClick:false` (right for the
  // editable canvas, where a click places the cursor). Here the reply is
  // read-only, so links should actually navigate — including the `/n/<id>`
  // permalinks responders embed to point at a document. Same-origin links go
  // through the SPA router (no full reload); external links open in a new tab.
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin) {
        e.preventDefault();
        router.push(url.pathname + url.search + url.hash);
      } else {
        e.preventDefault();
        window.open(url.href, '_blank', 'noopener,noreferrer');
      }
    },
    [router],
  );

  return (
    <StaticDoc
      html={html}
      onClick={onClick}
      // Base `prose` (16px reading size) — Saskia's reply is the document, so
      // it reads at full size like a page (not the smaller prose-sm).
      className="prose dark:prose-invert max-w-none focus:outline-none [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_pre]:leading-relaxed"
    />
  );
}
