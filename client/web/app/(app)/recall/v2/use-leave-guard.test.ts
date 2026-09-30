import { describe, expect, it } from 'vitest';
import { leavesScreen } from './use-leave-guard';

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
