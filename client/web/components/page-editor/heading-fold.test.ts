/**
 * The editor's fold plugin, run on a bare EditorState (no view, no DOM):
 * which blocks a fold hides, that folding never changes the doc, that the
 * caret opens a fold it lands in, and the schema's `data-fold` round trip.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Decoration } from '@tiptap/pm/view';
import { HeadingFold, foldSectionsOf, headingFoldKey, headingFoldPlugin } from './heading-fold';
import { BlockId } from './block-id';
import { TURN_OPTIONS } from './drag-handle';
import { getSlashItems } from './slash-menu';

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  HeadingFold,
  BlockId,
]);

type J = Record<string, unknown>;
const h = (id: string, level: number, fold: string | null, text = id): J => ({
  type: 'heading',
  attrs: { level, fold, id },
  content: [{ type: 'text', text }],
});
const p = (text: string): J => ({ type: 'paragraph', content: [{ type: 'text', text }] });

function stateOf(content: J[]): EditorState {
  const doc = PMNode.fromJSON(schema, { type: 'doc', content });
  return EditorState.create({ schema, doc, plugins: [headingFoldPlugin()] });
}

/** Text of every block a node decoration marks hidden, in order. */
function hidden(state: EditorState): string[] {
  const decos = headingFoldKey.getState(state)!.decos.find() as Decoration[];
  return decos
    .filter(
      (d) =>
        (d as unknown as { type: { attrs?: J } }).type.attrs?.['data-fold-hidden'] !== undefined,
    )
    .map((d) => state.doc.nodeAt(d.from)!.textContent);
}

// h1 A (closed) · p1 · h2 B (open) · p2 · h1 C · p3
const DOC = [h('A', 1, 'closed'), p('p1'), h('B', 2, 'open'), p('p2'), h('C', 1, null), p('p3')];

describe('fold sections', () => {
  it('a closed heading hides its section up to the next heading of its level', () => {
    const state = stateOf(DOC);
    expect(hidden(state)).toEqual(['p1', 'B', 'p2']);
  });

  it('every foldable heading gets an arrow, a normal one none', () => {
    const state = stateOf(DOC);
    const widgets = (headingFoldKey.getState(state)!.decos.find() as Decoration[]).filter(
      (d) => d.from === d.to,
    );
    expect(widgets).toHaveLength(2);
  });

  it('works inside a container, within that container', () => {
    const doc = PMNode.fromJSON(schema, {
      type: 'doc',
      content: [{ type: 'blockquote', content: [h('Q', 2, 'closed'), p('in')] }, p('out')],
    });
    const s = foldSectionsOf(doc, {});
    expect(s).toHaveLength(1);
    expect(s[0]!.blocks).toHaveLength(1);
    expect(doc.nodeAt(s[0]!.blocks[0]!.pos)!.textContent).toBe('in');
  });
});

describe('folding is the reader’s, not the doc’s', () => {
  it('a fold meta changes what is hidden and leaves the doc alone', () => {
    const state = stateOf(DOC);
    const tr = state.tr.setMeta(headingFoldKey, { set: { A: false, B: true } });
    const next = state.apply(tr);
    expect(tr.docChanged).toBe(false);
    expect(next.doc.eq(state.doc)).toBe(true);
    expect(hidden(next)).toEqual(['p2']);
  });

  it('a stored choice beats the doc default', () => {
    const state = stateOf(DOC);
    const next = state.apply(state.tr.setMeta(headingFoldKey, { set: { A: false } }));
    expect(hidden(next)).toEqual([]);
  });
});

describe('the caret never stays in folded content', () => {
  it('a selection moved into a hidden block opens the fold', () => {
    const state = stateOf(DOC);
    const s = headingFoldKey.getState(state)!.sections.find((x) => x.id === 'A')!;
    const inside = s.from + 2; // inside p1
    const { state: next } = state.applyTransaction(
      state.tr.setSelection(TextSelection.create(state.doc, inside)),
    );
    expect(hidden(next)).toEqual([]);
  });

  it('a selection in the heading itself leaves it folded', () => {
    const state = stateOf(DOC);
    const { state: next } = state.applyTransaction(
      state.tr.setSelection(TextSelection.create(state.doc, 2)),
    );
    expect(hidden(next)).toEqual(['p1', 'B', 'p2']);
  });
});

describe('schema', () => {
  it('renders data-fold only on a foldable heading and parses it back', () => {
    const toDOM = schema.nodes.heading!.spec.toDOM!;
    const foldable = toDOM(schema.nodes.heading!.create({ level: 2, fold: 'closed' })) as [
      string,
      J,
    ];
    expect(foldable[1]['data-fold']).toBe('closed');
    const plain = toDOM(schema.nodes.heading!.create({ level: 2 })) as [string, J];
    expect(plain[1]['data-fold']).toBeUndefined();
    const rule = schema.nodes.heading!.spec.parseDOM!.find((r) => r.tag === 'h2')!;
    const el = { getAttribute: (k: string) => (k === 'data-fold' ? 'open' : null) };
    const attrs = (rule.getAttrs as (e: unknown) => J)(el);
    expect(attrs.fold).toBe('open');
  });
});

describe('menus', () => {
  it('Turn into a heading clears the fold (it is how a foldable one turns back)', () => {
    for (const o of TURN_OPTIONS.filter((x) => x.label.startsWith('Heading'))) {
      const calls: J[] = [];
      const chain = { setNode: (_t: string, attrs: J) => (calls.push(attrs), chain) };
      o.apply(chain as never);
      expect(calls[0]).toMatchObject({ fold: null });
    }
  });

  it('the slash menu offers foldable headings 1 to 3', () => {
    const ids = getSlashItems('fold').map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['fold-heading-1', 'fold-heading-2', 'fold-heading-3']),
    );
  });
});
