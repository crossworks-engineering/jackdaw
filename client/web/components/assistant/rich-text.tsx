'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { JSONContent } from '@tiptap/core';
import { StaticDoc } from '@/components/page-editor/static-doc';
import { richMarkdownToHtml } from '@/lib/rich-markdown';
import { chatLinkAction, sanitizeChatDoc } from '@/lib/chat-links';
import { useIsAdminUser } from '@/components/workspaces/use-shell-workspaces';

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
  // A login that is not an Admin user sees only the pictures it can load
  // (lib/chat-links.ts); false until the shell answers, so nothing it cannot
  // load is asked for meanwhile.
  const adminUser = useIsAdminUser();
  const html = useMemo(() => richMarkdownToHtml(markdown, { adminUser }), [markdown, adminUser]);
  // The same rules once more on the parsed document, whose values the DOM has
  // decoded: whatever an entity hid from the markdown pass is caught here.
  const transformDoc = useCallback(
    (doc: JSONContent) => sanitizeChatDoc(doc, adminUser),
    [adminUser],
  );

  // The shared page extensions set `link.openOnClick:false` (right for the
  // editable canvas, where a click places the cursor). Here the reply is
  // read-only, so links should actually navigate — including the `/n/<id>`
  // permalinks responders embed to point at a document. Same-origin links go
  // through the SPA router (no full reload); other http(s) links open in a new
  // tab; mailto is the browser's; any other scheme does nothing at all
  // (chatLinkAction).
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest('a');
      const href = anchor?.getAttribute('href');
      if (href == null) return;
      const action = chatLinkAction(href, window.location.origin);
      // A blocked scheme is refused whatever the modifier keys say.
      if (action.kind === 'block') {
        e.preventDefault();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      if (action.kind === 'route') {
        e.preventDefault();
        router.push(action.path);
      } else if (action.kind === 'open') {
        e.preventDefault();
        window.open(action.href, '_blank', 'noopener,noreferrer');
      }
    },
    [router],
  );

  return (
    <StaticDoc
      html={html}
      transformDoc={transformDoc}
      onClick={onClick}
      // Base `prose` (16px reading size) — Saskia's reply is the document, so
      // it reads at full size like a page (not the smaller prose-sm).
      className="prose dark:prose-invert max-w-none focus:outline-none [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_pre]:leading-relaxed"
    />
  );
}
