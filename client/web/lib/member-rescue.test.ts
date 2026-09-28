import { describe, expect, it } from 'vitest';
import { RESCUE_MAX_AGE_MS, dropRescue, keepRescue, takeRescue } from './member-rescue';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

const PATH = '/api/member/space/abc/draft';

describe('member rescue', () => {
  it('a kept write is taken once, then gone', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{"if_rev":3}', at: 1000 }, s);
    expect(takeRescue(PATH, 2000, s)).toEqual({ method: 'PUT', body: '{"if_rev":3}', at: 1000 });
    expect(takeRescue(PATH, 2000, s)).toBeNull();
    expect(s.size()).toBe(0);
  });

  it('an answered write leaves nothing to send', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PUT', body: '{}', at: 1000 }, s);
    dropRescue(PATH, s);
    expect(takeRescue(PATH, 1000, s)).toBeNull();
  });

  it('a write older than the limit is dropped unsent (a note PATCH has no etag)', () => {
    const s = memStore();
    keepRescue(PATH, { method: 'PATCH', body: '{}', at: 0 }, s);
    expect(takeRescue(PATH, RESCUE_MAX_AGE_MS + 1, s)).toBeNull();
    expect(s.size()).toBe(0);
  });

  it('junk in storage is dropped, never sent', () => {
    const s = memStore();
    s.setItem(`mantle_member_rescue:${PATH}`, '{not json');
    expect(takeRescue(PATH, 0, s)).toBeNull();
    s.setItem(
      `mantle_member_rescue:${PATH}`,
      JSON.stringify({ method: 'DELETE', body: '', at: 0 }),
    );
    expect(takeRescue(PATH, 0, s)).toBeNull();
  });

  it('blocked or full storage never throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => keepRescue(PATH, { method: 'PUT', body: '{}', at: 0 }, broken)).not.toThrow();
    expect(takeRescue(PATH, 0, broken)).toBeNull();
  });
});
