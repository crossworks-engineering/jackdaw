import { describe, expect, it } from 'vitest';

import { buildVarMap } from './client';
import { reviveEnvironments, reviveObjectArray } from './storage';
import type { Environment } from './types';

/**
 * The API Console persists its environments, collections and history in
 * localStorage, and used to read them back with a bare `JSON.parse(raw) as T`.
 *
 * That cast is a promise the data cannot keep. A stored environment missing its
 * `vars` array — hand-edited, half-written by a crashed tab, or left by a build
 * that predates a field — reached `buildVarMap`, which did `for (const v of
 * env.vars)` and threw **"env.vars is not iterable"** during render. The whole
 * console went down on load, and the only way out was clearing storage from a
 * devtools console the crash made hard to reach.
 *
 * These tests pin both halves of the fix: the reviver repairs what it can, and
 * `buildVarMap` no longer trusts its argument either.
 */

describe('reviveEnvironments', () => {
  it('fills in a missing vars array — the shape that crashed the console', () => {
    const stored = [{ id: 'env_local', name: 'This server', baseUrl: '' }];
    const revived = reviveEnvironments(stored)!;
    expect(revived).toHaveLength(1);
    expect(revived[0]!.vars, 'a missing vars must become an empty list').toEqual([]);
  });

  it('keeps the entries it recognises and drops the ones it does not', () => {
    const revived = reviveEnvironments([
      { id: 'a', name: 'Dev', baseUrl: 'https://dev.example', vars: [] },
      null,
      'not an environment',
      42,
    ])!;
    expect(revived.map((e) => e.id)).toEqual(['a']);
  });

  it('repairs a var row rather than discarding the environment around it', () => {
    const revived = reviveEnvironments([
      { id: 'a', name: 'Dev', baseUrl: '', vars: [{ key: 'token' }, null, { id: 'kv_1' }] },
    ])!;
    // `enabled` defaults to true (absent ≠ off), value to ''; the null row goes.
    expect(revived[0]!.vars).toEqual([
      { id: expect.any(String), enabled: true, key: 'token', value: '' },
      { id: 'kv_1', enabled: true, key: '', value: '' },
    ]);
  });

  it('rejects a value that is not a list at all, so the caller keeps its default', () => {
    expect(reviveEnvironments({ id: 'a' })).toBeNull();
    expect(reviveEnvironments('[]')).toBeNull();
    expect(reviveEnvironments(null)).toBeNull();
    // An array that yields nothing usable is a rejection too — an empty
    // environment list would leave the console with no server to talk to.
    expect(reviveEnvironments([null, 7])).toBeNull();
  });
});

describe('reviveObjectArray', () => {
  it('passes object rows through and rejects a non-array', () => {
    expect(reviveObjectArray([{ a: 1 }, null, 'x'])).toEqual([{ a: 1 }]);
    expect(reviveObjectArray({ a: 1 })).toBeNull();
  });
});

describe('buildVarMap', () => {
  it('does not throw on the malformed environment that caused the crash', () => {
    const bad = { id: 'a', name: 'Dev', baseUrl: 'https://x.example' } as Environment;
    expect(() => buildVarMap(bad)).not.toThrow();
    // Degrades rather than dying: the baseUrl still resolves.
    expect(buildVarMap(bad)).toEqual({ baseUrl: 'https://x.example' });
  });

  it('still maps enabled vars, and skips disabled or unnamed ones', () => {
    const env: Environment = {
      id: 'a',
      name: 'Dev',
      baseUrl: '',
      vars: [
        { id: '1', enabled: true, key: 'token', value: 'abc' },
        { id: '2', enabled: false, key: 'skipped', value: 'nope' },
        { id: '3', enabled: true, key: '', value: 'unnamed' },
      ],
    };
    expect(buildVarMap(env)).toEqual({ baseUrl: '', token: 'abc' });
  });
});
