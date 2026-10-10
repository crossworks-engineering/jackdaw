/**
 * The switcher's choice is kept per login, and a blocked storage never
 * throws.
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
});
