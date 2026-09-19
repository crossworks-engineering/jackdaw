import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import {
  getSlashItems,
  SlashMenu,
  type SlashItem,
  type SlashMenuHandle,
  type SlashMenuProps,
} from './slash-menu';
import { placeCaretMenu, remToPx, type CaretMenuSide } from './caret-menu-position';

/**
 * Slash command: type "/" to open a spacious block picker. Built on TipTap's
 * Suggestion utility (the same primitive behind @-mentions). The popup is a
 * React component (SlashMenu) mounted to <body> and positioned at the caret
 * with plain fixed-positioning (`caret-menu-position.ts`: it opens on the side
 * with more room and is capped to it), no tippy / floating-ui dependency.
 *
 * No schema/nodes are added here, so this stays editor-only and the read-only
 * PageView (which omits it) renders identically.
 */
export interface SlashCommandOptions {
  /** Id of the page being edited. The `/page` item creates a sub-page with
   *  `parent_id` set to this, so it needs to know "which page am I in?".
   *  Exposed via storage so the static slash items can read it off `editor`. */
  pageId: string | null;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { pageId: null };
  },

  // Mirror the page id into storage so a slash item's command (which only
  // receives { editor, range }) can reach it via `editor.storage.slashCommand`.
  addStorage() {
    return { pageId: this.options.pageId };
  },

  onBeforeCreate() {
    this.storage.pageId = this.options.pageId;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        // Run the chosen item's command against the slash range.
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        items: ({ query }) => getSlashItems(query),
        render: () => {
          let component: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
          let popup: HTMLDivElement | null = null;
          let rectFn: (() => DOMRect | null) | null | undefined = null;
          let ro: ResizeObserver | null = null;
          let side: CaretMenuSide | null = null;
          let editorDom: HTMLElement | null = null;
          let frame = 0;

          // Side, cap and on-screen clamp all live in `placeCaretMenu`, shared
          // with the mention list. Keeping the menu inside the visible area is
          // also what makes the arrow-key scrollIntoView (in SlashMenu) a no-op
          // instead of yanking the whole page.
          const reposition = () => {
            if (!popup || !rectFn) return;
            const rect = rectFn();
            if (!rect) return;
            side = placeCaretMenu(popup, rect, {
              editorDom,
              margin: 8,
              maxHeight: remToPx(22),
              minHeight: remToPx(12),
              current: side,
            });
          };

          const close = () => {
            cancelAnimationFrame(frame);
            side = null;
            ro?.disconnect();
            ro = null;
            popup?.remove();
            popup = null;
            component?.destroy();
            component = null;
          };

          return {
            onStart: (props) => {
              rectFn = props.clientRect;
              editorDom = props.editor.view.dom;
              component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '50';
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              reposition();
              // ReactRenderer commits the menu content asynchronously, so its
              // height isn't known yet. Reposition the moment it gets a real size
              // (and whenever the filtered list changes height) — this is what
              // fixes the "first open jumps off-screen on arrow-key" bug.
              ro = new ResizeObserver(() => reposition());
              ro.observe(popup);
            },
            onUpdate: (props) => {
              rectFn = props.clientRect;
              component?.updateProps(props);
              reposition();
              // The filtered list commits asynchronously, and a capped menu does
              // not change size when its content does, so the ResizeObserver
              // stays quiet. Measure again once the new rows are in.
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(reposition);
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                close();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => close(),
          };
        },
      }),
    ];
  },
});
