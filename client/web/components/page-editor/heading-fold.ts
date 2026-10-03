/**
 * Foldable headings in the editor (Notion's toggle heading).
 *
 * The document stores only `heading.attrs.fold`: null (a normal heading),
 * 'open' or 'closed' (foldable, and how it starts for a reader who never
 * chose). Whether a heading is folded NOW is the reader's own choice, kept in
 * localStorage by heading id (content-core heading-fold.ts has the rules and
 * the store, shared with the static renders and the brain's share reader).
 * So folding never changes the doc: no autosave, no draft, no undo step.
 *
 * What this adds:
 *  - the `fold` attribute on headings (`data-fold` in HTML, so StaticDoc and
 *    the share surface see it);
 *  - an arrow widget in front of each foldable heading's text (sideways when
 *    folded, down when open) that folds and unfolds it;
 *  - node decorations that hide a folded heading's section (`data-fold-hidden`,
 *    hidden on screen only by share-ui app.css, so print shows everything);
 *  - clicks: the arrow always toggles. In an editable editor a click on a
 *    FOLDED heading opens it and the caret lands where you clicked; a click
 *    on an OPEN heading only edits. In a read-only editor a click anywhere on
 *    the heading toggles it (a link in it still works);
 *  - the caret never stays in hidden content: a selection that lands there
 *    (Enter at the end of a folded heading, search, a jump) opens the fold;
 *  - the `setHeadingFold` command (drag handle, bubble menu, slash items).
 */
import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  foldSections,
  isFolded,
  normalizeFold,
  readFoldChoices,
  writeFoldChoice,
  type FoldChoices,
  type HeadingFold as FoldValue,
} from '@mantle/content-core/heading-fold';
import { FOLD_CHEVRON_SVG, FOLD_TOGGLE_CLASS } from '@mantle/share-ui/heading-fold-dom';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingFold: {
      /** Make the heading at `pos` (default: the one holding the selection)
       *  foldable ('open' / 'closed' = how it starts) or a normal heading
       *  again (null). */
      setHeadingFold: (fold: FoldValue | null, pos?: number) => ReturnType;
    };
  }
}

/** One foldable heading and the section under it. */
export type FoldSection = {
  /** Position of the heading node. */
  pos: number;
  node: PMNode;
  id: string;
  folded: boolean;
  /** The hidden range: just after the heading to the end of its section. */
  from: number;
  to: number;
  /** Positions of the blocks in the section (what gets hidden). */
  blocks: { pos: number; size: number }[];
};

/** Every foldable heading in the doc with its section, every container deep. */
export function foldSectionsOf(doc: PMNode, choices: FoldChoices): FoldSection[] {
  const out: FoldSection[] = [];
  const visit = (parent: PMNode, start: number) => {
    const kids: { node: PMNode; pos: number }[] = [];
    parent.forEach((node, offset) => kids.push({ node, pos: start + offset }));
    const sections = foldSections(
      kids.length,
      (i) =>
        kids[i]!.node.type.name === 'heading' ? Number(kids[i]!.node.attrs.level) || 1 : null,
      (i) => normalizeFold(kids[i]!.node.attrs.fold) != null,
    );
    for (const [i, end] of sections) {
      const h = kids[i]!;
      const id = typeof h.node.attrs.id === 'string' ? h.node.attrs.id : '';
      const blocks = kids.slice(i + 1, end).map((k) => ({ pos: k.pos, size: k.node.nodeSize }));
      out.push({
        pos: h.pos,
        node: h.node,
        id,
        folded: isFolded(id, h.node.attrs.fold, choices),
        from: h.pos + h.node.nodeSize,
        to: end < kids.length ? kids[end]!.pos : start + parent.content.size,
        blocks,
      });
    }
    for (const k of kids) {
      if (!k.node.isTextblock && !k.node.isAtom && k.node.childCount > 0) visit(k.node, k.pos + 1);
    }
  };
  visit(doc, 0);
  return out;
}

type FoldState = { choices: FoldChoices; sections: FoldSection[]; decos: DecorationSet };
/** Choices to apply on top of the current ones (meta only). */
type FoldMeta = { set: FoldChoices };

export const headingFoldKey = new PluginKey<FoldState>('headingFold');

function arrow(view: EditorView, id: string, folded: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = FOLD_TOGGLE_CLASS;
  el.contentEditable = 'false';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-expanded', String(!folded));
  el.setAttribute('aria-label', folded ? 'Unfold section' : 'Fold section');
  el.innerHTML = FOLD_CHEVRON_SVG;
  // mousedown, not click: keep the caret where it is and stop ProseMirror
  // from starting a selection on the widget.
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFolded(view, id, !folded);
  });
  return el;
}

function build(doc: PMNode, choices: FoldChoices): FoldState {
  const sections = foldSectionsOf(doc, choices);
  const decos: Decoration[] = [];
  for (const s of sections) {
    decos.push(
      Decoration.widget(s.pos + 1, (view) => arrow(view, s.id, s.folded), {
        side: -1,
        key: `fold:${s.id || s.pos}:${s.folded ? 1 : 0}`,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
    if (!s.folded) continue;
    decos.push(Decoration.node(s.pos, s.from, { 'data-folded': '' }));
    for (const b of s.blocks) {
      decos.push(Decoration.node(b.pos, b.pos + b.size, { 'data-fold-hidden': '' }));
    }
  }
  return { choices, sections, decos: DecorationSet.create(doc, decos) };
}

/** Fold or unfold one heading for this reader (meta only: no doc change).
 *  `caret`: where to put the caret in the same step (a click that opens). */
export function setFolded(view: EditorView, id: string, folded: boolean, caret?: number): void {
  if (!id) return;
  writeFoldChoice(id, folded);
  const { state } = view;
  const tr = state.tr.setMeta(headingFoldKey, { set: { [id]: folded } } satisfies FoldMeta);
  tr.setMeta('addToHistory', false);
  // Folding the section the caret is in: park the caret at the heading's end
  // (the caret is never left in hidden content).
  const s = headingFoldKey.getState(state)?.sections.find((x) => x.id === id);
  if (folded && s && state.selection.from >= s.from && state.selection.from < s.to) {
    tr.setSelection(TextSelection.create(tr.doc, s.pos + s.node.nodeSize - 1));
  } else if (caret != null) {
    tr.setSelection(TextSelection.create(tr.doc, caret));
  }
  view.dispatch(tr);
}

/** Open every fold that hides `pos` (an outline jump into a folded section). */
export function revealFoldsAt(view: EditorView, pos: number): void {
  const sections = headingFoldKey.getState(view.state)?.sections ?? [];
  for (const s of sections) {
    if (s.folded && pos >= s.from && pos < s.to) setFolded(view, s.id, false);
  }
}

/** The plugin alone (tests build an EditorState with it, no view). */
export function headingFoldPlugin(): Plugin<FoldState> {
  return new Plugin<FoldState>({
    key: headingFoldKey,
    state: {
      init: (_, state) => build(state.doc, readFoldChoices()),
      apply(tr, prev, _old, next) {
        const meta = tr.getMeta(headingFoldKey) as FoldMeta | undefined;
        if (!meta && !tr.docChanged) return prev;
        const choices = meta ? { ...prev.choices, ...meta.set } : prev.choices;
        return build(next.doc, choices);
      },
    },
    // The caret never sits in folded content: open what hides it.
    appendTransaction(trs, _old, state: EditorState) {
      if (!trs.some((t) => t.selectionSet || t.docChanged)) return null;
      const fs = headingFoldKey.getState(state);
      if (!fs) return null;
      const at = state.selection.from;
      const hiding = fs.sections.filter((s) => s.folded && at >= s.from && at < s.to);
      if (hiding.length === 0) return null;
      const set: FoldChoices = {};
      for (const s of hiding) {
        writeFoldChoice(s.id, false);
        set[s.id] = false;
      }
      return state.tr
        .setMeta(headingFoldKey, { set } satisfies FoldMeta)
        .setMeta('addToHistory', false);
    },
    props: {
      decorations: (state) => headingFoldKey.getState(state)?.decos,
      handleClick(view, pos, event) {
        const target = event.target as Element | null;
        if (target?.closest(`.${FOLD_TOGGLE_CLASS}`)) return true;
        const $pos = view.state.doc.resolve(pos);
        const heading = $pos.parent;
        if (heading.type.name !== 'heading' || !normalizeFold(heading.attrs.fold)) return false;
        const at = $pos.before();
        const s = headingFoldKey.getState(view.state)?.sections.find((x) => x.pos === at);
        if (!s) return false;
        if (!view.editable) {
          if (target?.closest('a')) return false;
          setFolded(view, s.id, !s.folded);
          return true;
        }
        // Editing: a click opens a folded heading and puts the caret where it
        // landed. Done in one step here: redrawing the arrow under the browser's
        // own click handling lost the caret to the top of the page.
        if (!s.folded) return false;
        setFolded(view, s.id, false, pos);
        view.focus();
        return true;
      },
    },
  });
}

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          fold: {
            default: null,
            // Splitting a heading never makes a second foldable one.
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => normalizeFold(el.getAttribute('data-fold')),
            renderHTML: (attrs: Record<string, unknown>) => {
              const fold = normalizeFold(attrs.fold);
              return fold ? { 'data-fold': fold } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setHeadingFold:
        (fold, pos) =>
        ({ state, tr, dispatch }) => {
          let at = pos;
          if (at == null) {
            const $from = state.selection.$from;
            if ($from.parent.type.name !== 'heading') return false;
            at = $from.before();
          }
          const node = state.doc.nodeAt(at);
          if (!node || node.type.name !== 'heading') return false;
          if (dispatch) {
            tr.setNodeMarkup(at, undefined, { ...node.attrs, fold });
            // The author sees what they just set, whatever they chose before.
            const id = typeof node.attrs.id === 'string' ? node.attrs.id : '';
            if (fold && id) {
              writeFoldChoice(id, fold === 'closed');
              tr.setMeta(headingFoldKey, {
                set: { [id]: fold === 'closed' },
              } satisfies FoldMeta);
            }
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [headingFoldPlugin()];
  },
});

/** The fold of the heading at `pos`: undefined when it is not a heading. */
export function headingFoldAt(editor: Editor, pos: number): FoldValue | null | undefined {
  const node = pos >= 0 ? editor.state.doc.nodeAt(pos) : null;
  if (!node || node.type.name !== 'heading') return undefined;
  return normalizeFold(node.attrs.fold);
}
