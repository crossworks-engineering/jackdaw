/**
 * The switcher's choice is kept per login, a blocked storage never
 * throws, and a write the storage refuses still switches for this page.
 */
import { describe, expect, it } from 'vitest';
import {
  currentWorkspaceStorageKey,
  readCurrentWorkspace,
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
});
