import { describe, expect, it } from 'vitest';
import { chosenLook, folderNameNote } from './folder-dialogs';

describe('what a new folder submits of its look', () => {
  it('only what was chosen: a cleared icon and no colour are left out', () => {
    expect(chosenLook({})).toEqual({});
    expect(chosenLook({ icon: '', color: null })).toEqual({});
    expect(chosenLook({ icon: 'lucide:briefcase', color: 'cyan' })).toEqual({
      icon: 'lucide:briefcase',
      color: 'cyan',
    });
    expect(chosenLook({ icon: '🎉' })).toEqual({ icon: '🎉' });
    expect(chosenLook({ color: 'pink' })).toEqual({ color: 'pink' });
  });
});

describe('who the folder dialog says sees a folder (W6b)', () => {
  it('speaks of workspaces, never of the whole brain or of an admin accepting', () => {
    expect(folderNameNote(false, null)).toBe('Users of the workspace it lands in see it.');
    expect(folderNameNote(false, 'Work')).toBe('Inside Work. Users who see Work see it.');
    expect(folderNameNote(true, 'Work')).toBe('Everyone who sees this folder sees the new name.');
    for (const renaming of [true, false]) {
      expect(folderNameNote(renaming, 'Work')).not.toMatch(/on this brain|accept/i);
    }
  });
});
