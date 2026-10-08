/**
 * The FocusMarks and DiffReview pushes, run on a bare EditorState (no view):
 * the host dispatches only a real change, so a page that opens with nothing
 * marked and no review sends the editor no transaction at all, and an equal
 * push (same ids, any order) is a no-op.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, type Plugin } from '@tiptap/pm/state';
import type { DiffOverlay } from '@mantle/content-core/page-diff';
import { FocusMarks, focusMarksKey, focusMarksTr } from './focus-marks';
import { DiffReview, diffReviewKey, diffReviewTr } from './diff-review';

const schema = getSchema([StarterKit]);
const pluginsOf = (ext: typeof FocusMarks | typeof DiffReview) =>
  ext.config.addProseMirrorPlugins!.call({} as never) as Plugin[];

function fresh(): EditorState {
  return EditorState.create({
    schema,
    plugins: [...pluginsOf(FocusMarks), ...pluginsOf(DiffReview)],
  });
}

describe('focusMarksTr', () => {
  it('sends nothing when the plugin already holds the sets', () => {
    expect(focusMarksTr(fresh(), { marked: [], edited: [] })).toBeNull();
  });

  it('pushes a change, then treats the same ids in any order as no change', () => {
    const tr = focusMarksTr(fresh(), { marked: ['a', 'b'], edited: [] });
    expect(tr).not.toBeNull();
    const state = fresh().apply(tr!);
    expect([...focusMarksKey.getState(state)!.marked]).toEqual(['a', 'b']);
    expect(focusMarksTr(state, { marked: ['b', 'a', 'a'], edited: [] })).toBeNull();
    expect(focusMarksTr(state, { marked: ['a'], edited: [] })).not.toBeNull();
    expect(focusMarksTr(state, { marked: ['a', 'b'], edited: ['c'] })).not.toBeNull();
  });
});

describe('diffReviewTr', () => {
  const overlay: DiffOverlay = {
    addedIds: [],
    changedIds: [],
    removed: [],
    counts: { added: 0, changed: 0, removed: 0 },
  };

  it('sends nothing to clear a review that is not showing', () => {
    expect(diffReviewTr(fresh(), null)).toBeNull();
  });

  it('pushes a new overlay once, and a clear after it', () => {
    const tr = diffReviewTr(fresh(), overlay);
    expect(tr).not.toBeNull();
    const state = fresh().apply(tr!);
    expect(diffReviewKey.getState(state)!.overlay).toBe(overlay);
    expect(diffReviewTr(state, overlay)).toBeNull();
    expect(diffReviewTr(state, null)).not.toBeNull();
  });
});
