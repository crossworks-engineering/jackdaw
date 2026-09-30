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
  /** Id of the page being edited: the `/page` item makes a new page NEXT TO
   *  it and the Folder index block lists its folder. Exposed via storage so
   *  the static slash items can read it off `editor`. */
  pageId: string | null;
  /** The folder the page sits in (null at the top level; folder phase 7):
   *  where `/page` files the page it makes, and what `folder:here` means.
   *  Undefined when unknown (a brain before the pages tree). */
  folderId: string | null | undefined;
  /** Whether the Folder index item is offered (the brain serves the pages
   *  tree). */
  folderIndex: boolean;
  /** Called once `/page` made its page, so the screen can refresh what
   *  lists the folder (a Folder index on this page). */
  onPageCreated: (() => void) | null;
  /** A member login (member logins): no command that creates or uploads into
   *  the brain (sub-page, image, drawing, file); those routes refuse a member. */
  member: boolean;
  /** An admin's private item (member logins Phase 7): it is not a brain page
   *  and sits in no folder, so no new brain page or folder index. Everything
   *  else stays. */
  privateItem: boolean;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      pageId: null,
      folderId: undefined,
      folderIndex: false,
      onPageCreated: null,
      member: false,
      privateItem: false,
    };
  },

  // Mirror the page and folder ids into storage so a slash item's command
  // (which only receives { editor, range }) can reach them via
  // `editor.storage.slashCommand`.
  addStorage() {
    return {
      pageId: this.options.pageId,
      folderId: this.options.folderId,
      onPageCreated: this.options.onPageCreated,
    };
  },

  onBeforeCreate() {
    this.storage.pageId = this.options.pageId;
    this.storage.folderId = this.options.folderId;
    this.storage.onPageCreated = this.options.onPageCreated;
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
        items: ({ query }) =>
          getSlashItems(query, {
            member: this.options.member,
            privateItem: this.options.privateItem,
            folderIndex: this.options.folderIndex,
          }),
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
