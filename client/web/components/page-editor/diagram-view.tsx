'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * LEGACY read-only view for `diagram` nodes (the retired Mermaid engine,
 * 2026-08). Stored docs still carry these nodes, so the schema keeps the type
 * and this view shows the stored source as a labelled code block — matching
 * the server-side degrade on /s shares, /print, docx and email. Nothing
 * renders Mermaid anymore: new diagram work is the Draftsman specialist's
 * SVG + spec block (mantle docs/diagrams.md). The block stays selectable and
 * deletable; the source is kept verbatim so nothing is lost.
 */
export function DiagramView({ node, selected }: NodeViewProps) {
  const source = typeof node.attrs.source === 'string' ? node.attrs.source : '';
  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <div
        contentEditable={false}
        data-diagram
        className={`rounded-md border border-border bg-muted/30 ${
          selected ? 'outline-2 outline-primary outline-offset-2' : ''
        }`}
      >
        <div className="border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Diagram (legacy)
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-sm text-foreground">
          <code>{source || '(empty)'}</code>
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
