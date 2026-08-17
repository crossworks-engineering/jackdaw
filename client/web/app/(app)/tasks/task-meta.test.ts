import { describe, expect, it } from 'vitest';

import { BOARD_COLUMNS, boardColumnFor, statusForDrop } from './task-meta';

/**
 * The board shows three columns for four statuses, which is only safe while
 * these two functions agree. Both drag bugs found in the last review were in
 * this arithmetic and were caught by reading rather than by a test.
 */

describe('boardColumnFor', () => {
  it('gives every status a column, so nothing can vanish from the board', () => {
    for (const status of ['open', 'in_progress', 'blocked', 'done'] as const) {
      expect(BOARD_COLUMNS).toContain(boardColumnFor(status));
    }
  });

  it('files blocked work under In progress', () => {
    expect(boardColumnFor('blocked')).toBe('in_progress');
  });

  it('leaves the three real columns alone', () => {
    expect(boardColumnFor('open')).toBe('open');
    expect(boardColumnFor('in_progress')).toBe('in_progress');
    expect(boardColumnFor('done')).toBe('done');
  });
});

describe('statusForDrop', () => {
  it('does NOT unblock a task reordered inside In progress', () => {
    // The trap: blocked cards live in that column, so the naive "status = the
    // column you dropped into" clears the flag on a plain tidy-up drag.
    expect(statusForDrop('blocked', 'in_progress')).toBe('blocked');
  });

  it('still moves a blocked task dragged OUT of the column', () => {
    expect(statusForDrop('blocked', 'done')).toBe('done');
    expect(statusForDrop('blocked', 'open')).toBe('open');
  });

  it('writes the column for every non-blocked task', () => {
    for (const column of BOARD_COLUMNS) {
      expect(statusForDrop('open', column)).toBe(column);
      expect(statusForDrop('in_progress', column)).toBe(column);
      expect(statusForDrop('done', column)).toBe(column);
    }
  });

  it('round-trips: a card dropped in its own column keeps its status', () => {
    for (const status of ['open', 'in_progress', 'blocked', 'done'] as const) {
      expect(statusForDrop(status, boardColumnFor(status))).toBe(status);
    }
  });
});
