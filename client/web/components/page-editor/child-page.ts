import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ChildPageView } from './child-page-view';

/**
 * childPage, the page link card: a full-width clickable card that navigates
 * to `/pages/<pageId>`. The block-level, inline equivalent of a `PageMention`:
 * where a mention is a chip inside a paragraph, this is a card. The node
 * name is from when it linked a SUB-page; pages do not nest since folder
 * phase 7, and the card is a link, never a parent-child bond (the brain
 * still counts it as an embed: a shared page opens what it links to).
 *
 * It's an atom (no editable content) referencing a backing `page` node by id;
 * the `title` / `icon` attrs are a snapshot for display (the card refreshes the
 * live title on mount so renames show up). The card is created by the `/page`
 * slash command, which makes a page next to the current one (see
 * slash-menu.tsx). Part of the shared schema so PageView renders the card
 * identically; the public renderer (render-page-doc.ts) emits an inert label
 * (the linked page is not part of what the link shares).
 */
export const ChildPage = Node.create({
  name: 'childPage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page-id'),
        renderHTML: (attrs) => (attrs.pageId ? { 'data-page-id': attrs.pageId } : {}),
      },
      title: {
        default: 'Untitled page',
        parseHTML: (el) => el.getAttribute('data-title') ?? 'Untitled page',
        renderHTML: (attrs) => ({ 'data-title': attrs.title ?? 'Untitled page' }),
      },
      icon: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-icon'),
        renderHTML: (attrs) => (attrs.icon ? { 'data-icon': attrs.icon } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-child-page]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-child-page': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChildPageView);
  },
});
