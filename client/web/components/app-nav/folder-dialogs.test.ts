import { describe, expect, it } from 'vitest';
import { folderNameNote } from './folder-dialogs';

describe('who the folder dialog says sees a folder', () => {
  it('the brain’s folders: everyone on this brain', () => {
    expect(folderNameNote('brain', false, null)).toBe(
      'Everyone on this brain sees the same folders.',
    );
    expect(folderNameNote('brain', false, 'Work')).toBe(
      'Inside Work. Everyone on this brain sees it.',
    );
    expect(folderNameNote('brain', true, null)).toBe('Everyone on this brain sees the new name.');
  });

  it('a member’s own folders: only the member, until an admin accepts something in one', () => {
    const own = 'Only you see this folder until an admin accepts something in it.';
    expect(folderNameNote('member', false, null)).toBe(own);
    expect(folderNameNote('member', false, 'Work')).toBe(`Inside Work. ${own}`);
    expect(folderNameNote('member', true, 'Work')).toBe(own);
    for (const renaming of [true, false]) {
      expect(folderNameNote('member', renaming, 'Work')).not.toMatch(/everyone/i);
    }
  });
});
