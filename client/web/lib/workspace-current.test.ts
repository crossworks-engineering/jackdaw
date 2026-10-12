/**
 * The switcher's choice is kept per login, a blocked storage never
 * throws, a write the storage refuses still switches for this page, and a
 * pick another tab stores wins over one this page holds.
 */
import { describe, expect, it } from 'vitest';
import {
  currentWorkspaceStorageKey,
  onPickStorageEvent,
  readCurrentWorkspace,
  subscribeCurrentWorkspace,
  writeCurrentWorkspace,
} from './workspace-current';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('current workspace store', () => {
  it('keys the choice by login, case-blind', () => {
    expect(currentWorkspaceStorageKey('Ann@X.test')).toBe(currentWorkspaceStorageKey('ann@x.test'));
    expect(currentWorkspaceStorageKey(null)).not.toBe(currentWorkspaceStorageKey('a@x.test'));
  });

  it('two logins keep their own choice', () => {
    const s = memory();
    writeCurrentWorkspace('a@x.test', 'w1', s);
    writeCurrentWorkspace('b@x.test', 'w2', s);
    expect(readCurrentWorkspace('a@x.test', s)).toBe('w1');
    expect(readCurrentWorkspace('b@x.test', s)).toBe('w2');
  });

  it('null forgets the choice (All my workspaces)', () => {
    const s = memory();
    writeCurrentWorkspace('a@x.test', 'w1', s);
    writeCurrentWorkspace('a@x.test', null, s);
    expect(readCurrentWorkspace('a@x.test', s)).toBeNull();
  });

  it('a storage that throws reads null and writes nothing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readCurrentWorkspace('a@x.test', broken)).toBeNull();
    expect(() => writeCurrentWorkspace('a@x.test', 'w1', broken)).not.toThrow();
  });

  it('a pick the storage refuses (full) still wins over the old stored one', () => {
    // A full storage: it reads the choice it kept before, and refuses a new
    // one (QuotaExceededError). Removing still works.
    const m = new Map<string, string>([[currentWorkspaceStorageKey('a@x.test'), 'admin']]);
    const full = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: (k: string) => void m.delete(k),
    };
    expect(readCurrentWorkspace('a@x.test', full)).toBe('admin');
    writeCurrentWorkspace('a@x.test', 'team', full);
    expect(readCurrentWorkspace('a@x.test', full)).toBe('team');
    writeCurrentWorkspace('a@x.test', null, full);
    expect(readCurrentWorkspace('a@x.test', full)).toBeNull();
    writeCurrentWorkspace('a@x.test', 'team', full);
    expect(readCurrentWorkspace('a@x.test', full)).toBe('team');
    // Another login on the same storage keeps its own.
    expect(readCurrentWorkspace('b@x.test', full)).toBeNull();
  });

  it("another tab's newer pick wins over one this page holds, and readers hear of it", () => {
    const key = currentWorkspaceStorageKey('a@x.test');
    const m = new Map<string, string>();
    // A full storage: this page's picks are refused and held.
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: (k: string) => void m.delete(k),
    };
    writeCurrentWorkspace('a@x.test', 'team', store);
    expect(readCurrentWorkspace('a@x.test', store)).toBe('team');

    let heard = 0;
    const stop = subscribeCurrentWorkspace(() => heard++);
    try {
      // Another login's key, or a key that is not a pick: nothing changes.
      onPickStorageEvent({ key: currentWorkspaceStorageKey('b@x.test'), storageArea: store });
      onPickStorageEvent({ key: 'something.else', storageArea: store });
      expect(readCurrentWorkspace('a@x.test', store)).toBe('team');
      expect(heard).toBe(1);

      // Another tab had room and stored Board for this login.
      m.set(key, 'board');
      onPickStorageEvent({ key, storageArea: store });
      expect(readCurrentWorkspace('a@x.test', store)).toBe('board');
      expect(heard).toBe(2);

      // A held pick is dropped too when the other tab clears the storage.
      writeCurrentWorkspace('a@x.test', 'admin', store);
      expect(readCurrentWorkspace('a@x.test', store)).toBe('admin');
      m.clear();
      onPickStorageEvent({ key: null, storageArea: store });
      expect(readCurrentWorkspace('a@x.test', store)).toBeNull();
    } finally {
      stop();
    }
  });

  it('the server (no window, no storage) never holds a pick', () => {
    writeCurrentWorkspace('s@x.test', 'team', null);
    expect(readCurrentWorkspace('s@x.test', null)).toBeNull();
  });
});
