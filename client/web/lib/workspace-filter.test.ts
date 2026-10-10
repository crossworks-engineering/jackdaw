/**
 * The switcher's note never claims a filter the brain does not apply (CEO
 * audit H1): it says the lists show every workspace until a list answer
 * echoes the `ws` it was asked for.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { noteListAnswer, resetWsFilterSeen, wsFilterHonoured } from './workspace-filter';
import { SWITCHER_NOTE, SWITCHER_NOTE_ALL, switcherNote } from './workspaces';

afterEach(() => resetWsFilterSeen());

describe('the switcher filter', () => {
  it('is not claimed from an answer that does not echo ws', () => {
    noteListAnswer({ items: [] }, 'w1');
    noteListAnswer({ items: [], ws: 'w2' }, 'w1');
    noteListAnswer({ items: [], ws: 'w1' }, null);
    expect(wsFilterHonoured()).toBe(false);
    expect(switcherNote(wsFilterHonoured())).toBe(SWITCHER_NOTE_ALL);
  });

  it('is claimed once an answer echoes the ws it was asked for', () => {
    const answer = { items: [], ws: 'w1' };
    expect(noteListAnswer(answer, 'w1')).toBe(answer);
    expect(wsFilterHonoured()).toBe(true);
    expect(switcherNote(true)).toBe(SWITCHER_NOTE);
  });
});
