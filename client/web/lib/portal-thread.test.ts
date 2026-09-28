import { describe, expect, it } from 'vitest';
import { portalAtStart, portalCursor, prependOlder } from './portal-thread';

const m = (id: string, createdAt = `2026-09-0${id}T10:00:00.000Z`) => ({ id, createdAt });

describe('portalCursor', () => {
  it('is the oldest message on screen', () => {
    expect(portalCursor([m('3'), m('4'), m('5')])).toBe('2026-09-03T10:00:00.000Z');
  });
  it('is null for an empty thread', () => {
    expect(portalCursor([])).toBeNull();
  });
});

describe('portalAtStart', () => {
  it('a full window may have more before it', () => {
    expect(portalAtStart([m('1'), m('2')], 2)).toBe(false);
  });
  it('a short or empty window is the start', () => {
    expect(portalAtStart([m('1')], 2)).toBe(true);
    expect(portalAtStart([], 50)).toBe(true);
  });
});

describe('prependOlder', () => {
  it('puts the older page first, in order', () => {
    expect(prependOlder([m('1'), m('2')], [m('3'), m('4')]).map((x) => x.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });
  it('drops a message already on screen', () => {
    expect(prependOlder([m('1'), m('3')], [m('3'), m('4')]).map((x) => x.id)).toEqual([
      '1',
      '3',
      '4',
    ]);
  });
  it('an empty older page leaves the thread as it was', () => {
    const shown = [m('3')];
    expect(prependOlder([], shown)).toEqual(shown);
  });
});
