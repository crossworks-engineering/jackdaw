import { describe, expect, it } from 'vitest';
import { guardEntryState, isGuardEntry, leavesScreen } from './use-leave-guard';

describe('leavesScreen', () => {
  const here = new URL('https://brain.example/recall?selected=m1&card=fleet');
  it('holds a link to another screen, or to another map or card here', () => {
    expect(leavesScreen('/pages', here)).toBe(true);
    expect(leavesScreen('/recall?selected=m2', here)).toBe(true);
  });
  it('lets a link to exactly this place through', () => {
    expect(leavesScreen('/recall?selected=m1&card=fleet', here)).toBe(false);
    expect(leavesScreen('/recall?selected=m1&card=fleet#top', here)).toBe(false);
  });
  it('leaves another site to the browser prompt', () => {
    expect(leavesScreen('https://elsewhere.example/', here)).toBe(false);
  });
});

describe('the Back guard entry', () => {
  it('marks the guard entry and keeps the router state in it', () => {
    const next = { __NA: true, tree: ['x'] };
    const g = guardEntryState(next);
    expect(g).toMatchObject(next);
    expect(isGuardEntry(g)).toBe(true);
    expect(isGuardEntry(next)).toBe(false);
    expect(isGuardEntry(null)).toBe(false);
    expect(isGuardEntry(guardEntryState(null))).toBe(true);
  });
});
