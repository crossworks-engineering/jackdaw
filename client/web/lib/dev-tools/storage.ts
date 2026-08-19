/**
 * localStorage persistence for the API Console — saved requests, history,
 * environments. Mirrors the approach proven in master (DFM): console
 * state is operator-local scratch, not shared data, so the browser is the
 * right home for it. Secrets are scrubbed before anything is persisted.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftRequest, Environment, HistoryEntry, KeyValueEntry } from './types';

export const STORAGE_KEYS = {
  environments: 'dev-tools:environments:v1',
  activeEnvId: 'dev-tools:active-env:v1',
  collections: 'dev-tools:collections:v1',
  history: 'dev-tools:history:v1',
} as const;

export const HISTORY_LIMIT = 200;

export function genId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function emptyKv(): KeyValueEntry {
  return { id: genId('kv'), enabled: true, key: '', value: '' };
}

export function defaultEnvironments(): Environment[] {
  return [{ id: 'env_local', name: 'This server', baseUrl: '', vars: [] }];
}

export function emptyDraft(): DraftRequest {
  return {
    kind: 'http',
    name: 'Untitled request',
    method: 'GET',
    url: '{{baseUrl}}/api/health',
    params: [],
    headers: [],
    body: { mode: 'none', text: '' },
    auth: { mode: 'session' },
    pathValues: {},
    targetName: '',
    argsText: '{}',
  };
}

/**
 * Header/param keys that commonly carry a credential. Matched case-insensitively
 * against the key; a matching entry's value is blanked before persistence.
 */
const SENSITIVE_KEY =
  /\b(authorization|api[-_]?key|apikey|x[-_]?api[-_]?key|x[-_]?auth[-_]?token|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|secret|password|passwd|pwd|token|cookie|session[-_]?id|bearer|signature)\b|(^|[-_])key$/i;

/**
 * A `{{…}}` template carries no plaintext — `{{secret:svc/label}}` resolves
 * from the vault server-side, `{{var}}` from the environment — so it is safe to
 * persist verbatim. Only literal values of sensitive-keyed fields get blanked.
 */
function isTemplateValue(v: string): boolean {
  return /\{\{[^}]+\}\}/.test(v);
}

function scrubKv(entries: KeyValueEntry[]): KeyValueEntry[] {
  return entries.map((e) =>
    e.value && !isTemplateValue(e.value) && SENSITIVE_KEY.test(e.key) ? { ...e, value: '' } : e,
  );
}

/**
 * Blank pasted credentials before persisting: the bearer token, plus any
 * header or query param under a credential-ish key. `{{secret:…}}`/`{{var}}`
 * refs survive (they're pointers, not plaintext) so saved requests still run.
 */
export function scrubDraftSecrets(d: DraftRequest): DraftRequest {
  return {
    ...d,
    auth: {
      ...d.auth,
      token: d.auth.token && !isTemplateValue(d.auth.token) ? '' : d.auth.token,
    },
    headers: scrubKv(d.headers),
    params: scrubKv(d.params),
  };
}

/** Same heuristic for environment variables — they persist on every edit. */
/**
 * Normalise whatever `dev-tools:environments:v1` actually holds into a shape the
 * console can use, dropping anything unrecognisable.
 *
 * ⚠ This exists because the value is UNTRUSTED. It is JSON from localStorage —
 * hand-edited, half-written by a crashed tab, or left by a build that predates a
 * field — and the reader used to cast it straight to `Environment[]`. One
 * malformed entry then crashed the whole console at first render with
 * "env.vars is not iterable", and the only way out was clearing storage from a
 * devtools console the crash made it hard to reach.
 *
 * Missing pieces are filled rather than rejected: a saved environment the user
 * still recognises by name is worth keeping even if a field went missing.
 */
export function reviveEnvironments(parsed: unknown): Environment[] | null {
  if (!Array.isArray(parsed)) return null;
  const out: Environment[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Partial<Environment>;
    out.push({
      id: typeof e.id === 'string' && e.id ? e.id : genId('env'),
      name: typeof e.name === 'string' ? e.name : 'Environment',
      baseUrl: typeof e.baseUrl === 'string' ? e.baseUrl : '',
      vars: reviveKvs(e.vars),
    });
  }
  return out.length > 0 ? out : null;
}

function reviveKvs(parsed: unknown): KeyValueEntry[] {
  if (!Array.isArray(parsed)) return [];
  const out: KeyValueEntry[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Partial<KeyValueEntry>;
    out.push({
      id: typeof v.id === 'string' && v.id ? v.id : genId('kv'),
      enabled: v.enabled !== false,
      key: typeof v.key === 'string' ? v.key : '',
      value: typeof v.value === 'string' ? v.value : '',
    });
  }
  return out;
}

/** The other persisted lists are only ever mapped and filtered, so "is it an
 *  array of objects" is the whole contract. A non-array would break them the
 *  same way a missing `vars` broke environments. */
export function reviveObjectArray<T>(parsed: unknown): T[] | null {
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((x): x is T => !!x && typeof x === 'object');
}

export function scrubEnvSecrets(envs: Environment[]): Environment[] {
  return envs.map((e) => ({ ...e, vars: scrubKv(e.vars) }));
}

/** Max request-body kept per history entry — history holds 200 of them and is
 *  re-serialized on every send, so an uncapped multi-MB body blows the quota. */
const HISTORY_BODY_CAP = 10_000;

export function capDraftBody(d: DraftRequest): DraftRequest {
  if (d.body.text.length <= HISTORY_BODY_CAP) return d;
  return {
    ...d,
    body: { ...d.body, text: `${d.body.text.slice(0, HISTORY_BODY_CAP)}…[truncated]` },
  };
}

/**
 * useState backed by localStorage. Reads lazily on mount (SSR-safe),
 * writes on change. Storage failures (quota, private mode) degrade to
 * in-memory state silently — it's a dev console, not a datastore.
 */
export function usePersistedState<T>(
  key: string,
  initial: () => T,
  /** Applied to the value before it's written to localStorage only — the
   *  in-memory state is unchanged. Use to scrub secrets from the persisted
   *  copy without blanking values the live session still needs. */
  persistTransform?: (v: T) => T,
  /** Validate/repair what came out of localStorage. Return `null` to reject it
   *  and keep `initial()`. WITHOUT this the parsed JSON is cast blind, and a
   *  malformed entry takes the screen down on first render. */
  revive?: (parsed: unknown) => T | null,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  const transformRef = useRef(persistTransform);
  transformRef.current = persistTransform;

  const reviveRef = useRef(revive);
  reviveRef.current = revive;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        const revived = reviveRef.current ? reviveRef.current(parsed) : (parsed as T);
        if (revived !== null && revived !== undefined) setValue(revived);
      }
    } catch {
      /* unparseable or rejected — keep initial */
    }
    loaded.current = true;
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          const toStore = transformRef.current ? transformRef.current(resolved) : resolved;
          window.localStorage.setItem(key, JSON.stringify(toStore));
        } catch {
          /* in-memory only */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

export function appendHistory(prev: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...prev].slice(0, HISTORY_LIMIT);
}
