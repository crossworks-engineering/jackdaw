import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * MineItem's wiring, where the node test runner cannot render it: the rules
 * are unit-tested in lib/member-autosave.test.ts, the behaviour in
 * e2e/member/mine-autosave.spec.ts.
 */
const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const item = src('./mine-item.tsx');

describe('an item frozen elsewhere keeps the editor, read-only, until let go', () => {
  it('holds by the shared rule, once per open item', () => {
    expect(item).toContain(
      'if (!held && !released && holdsEditor(autosave, editable)) setHeld(true);',
    );
    // No longer swapped for the view the moment the save is refused.
    expect(item).not.toMatch(/state\.reason !== 'conflict'\) refreshItem\(\)/);
  });

  it('keeps the editor mounted while held, and read-only', () => {
    expect(item).toContain('readOnly: held,');
    expect(item).toContain('if (!editable && !held) {');
  });

  it.each([
    ['./mine-page-editor.tsx', 'editable={!readOnly}'],
    ['./mine-note-editor.tsx', 'readOnly={readOnly}'],
    ['./member-draw-editor.tsx', 'viewMode={readOnly}'],
    ['./member-table-editor.tsx', 'if (readOnly) return;'],
  ])('%s takes no change while read-only', (file, needle) => {
    expect(src(file)).toContain(needle);
  });
});

describe('Submit waits for the title', () => {
  it('saves the title before anything else, and a failed rename stops it', () => {
    expect(item).toMatch(
      /const beforeSubmit = async \(\) => \{\s*if \(!\(await saveTitle\(\)\)\) return false;/,
    );
  });
});
