import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DiagramView } from './diagram-view';

/**
 * LEGACY diagram block (the retired Mermaid engine, 2026-08). The node type
 * stays in the schema because stored docs carry these nodes — dropping it
 * would make ProseMirror reject old documents outright. The NodeView shows
 * the stored source as a read-only labelled code block; nothing renders
 * Mermaid anymore, and the slash menu no longer inserts this node. New
 * diagram work is the Draftsman specialist's SVG + spec block (mantle
 * docs/diagrams.md). Serialized as `<div data-diagram data-source="…">` so
 * copy/paste HTML still round-trips.
 */
export const Diagram = Node.create({
  name: 'diagram',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-source') ?? '',
        renderHTML: (attrs) => ({ 'data-source': String(attrs.source ?? '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-diagram]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-diagram': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },
});
