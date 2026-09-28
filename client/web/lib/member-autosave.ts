/**
 * The save queue behind every member editor in Mine (member logins, Phase 2):
 * pages, notes, drawings and tables. One module, so the four editors cannot
 * drift into four different sets of holes (the owner editors did, see
 * use-flush-on-leave.ts). React-free on purpose: the rules are unit-tested.
 *
 * The rules, each one a bug the audit found in the first member editors:
 *
 *  - Dirty is a SNAPSHOT comparison, never a flag. The queue remembers the key
 *    of the document the server holds; a save marks exactly the snapshot it
 *    SENT as saved. Typing while a request is on the wire stays dirty and the
 *    debounce is armed again, so the last words are never shown as saved.
 *  - One request in flight. The draft etag is strict: two writes carrying the
 *    same `if_rev` guarantee one of our own writes a 409. Every write (the
 *    debounce, a blur, Save version, the flush before Submit, the leave flush)
 *    goes through one chain, and a queued save reads the document when it
 *    RUNS, so only the latest is sent.
 *  - A stale etag (409 with `current_rev`, no `reason`) is adopted and the
 *    local document is sent again, once. The member is the only writer of
 *    their own draft and the local editor holds the latest typing, so this
 *    is the intended outcome, not a clobber. A second conflict in a row stops
 *    autosave and says so.
 *  - A state refusal that freezes the item (409 `frozen` or `not-draft`)
 *    stops autosave with the brain's own sentence: retrying cannot help. Any
 *    other refusal (`embed` on Save version, `quota`) fails that write only.
 *  - A network failure (or a 502, 503 or 504 from the proxy in front of a
 *    restarting brain) retries with backoff, bounded.
 *  - Any other 5xx is the brain failing on this write. The first one retries
 *    like a network failure; a second in a row stops retrying and says the
 *    server could not save it (not "check your connection", which sent
 *    members hunting for a network fault for a minute). The typing stays in
 *    the editor and the next edit tries again.
 *  - `flush()` resolves true only once everything read at call time is on the
 *    server, which is what Submit and the leave hook await.
 */
import { ApiError } from '@mantle/web-ui/api-fetch';
import { refusalMessage } from './member-space';

export type AutosaveState =
  /** The server holds what the editor shows. */
  | { status: 'saved' }
  /** Local edits not on the server yet (the debounce is armed). */
  | { status: 'pending' }
  /** A request is on the wire (or queued behind one). */
  | { status: 'saving' }
  /** The last attempt failed on the network; another is scheduled. */
  | { status: 'retrying'; attempt: number }
  /** The brain refused the change; the next edit tries again. */
  | { status: 'failed'; message: string }
  /** Autosave is off until the item is reloaded (a state refusal, or a
   *  conflict that adopting the brain's etag did not resolve). */
  | { status: 'stopped'; reason: string; message: string };

/** How a failed write is handled (see classifySaveError). */
export type SaveFailure =
  | { kind: 'conflict'; currentRev?: number }
  | { kind: 'state'; reason: string; message: string }
  | { kind: 'auth' }
  | { kind: 'network' }
  | { kind: 'server'; status: number }
  | { kind: 'invalid'; status: number; message: string };

/** Sends `doc` on top of the etag `rev`; `base` is the document the server
 *  held after the last successful write (a table diffs its ops from it). */
export type AutosaveSend<T> = (doc: T, rev: number, base: T) => Promise<{ rev: number }>;

export type AutosaveOptions<T> = {
  /** The editor's current document (read when a save RUNS, not when queued). */
  read: () => T;
  /** What the server holds now, and its draft etag. */
  saved: T;
  rev: number;
  /** The autosave write (a draft PUT, or a note PATCH). */
  send: AutosaveSend<T>;
  debounceMs: number;
  /** Save anyway after this long of continuous editing (a drawing fires a
   *  change per stroke, so a pure debounce could wait forever). */
  maxWaitMs?: number;
  /** Snapshot identity. Defaults to JSON. */
  key?: (doc: T) => string;
  /** Backoff after a network failure; one entry per retry. */
  retryDelaysMs?: readonly number[];
  onState?: (state: AutosaveState) => void;
  /** Every failed write, classified (the table reloads on a refused op). */
  onFailure?: (failure: SaveFailure) => void;
  /** After every successful write of the draft. */
  onSaved?: () => void;
  /** Re-send on top of the brain's etag after a stale-etag 409 (default
   *  true). A sender that writes a DIFF from `base` (the table's ops) passes
   *  false: after a lost response the first batch may already be in, and the
   *  same ops again would add a row twice. The conflict then goes to
   *  onFailure, and the editor reloads the brain's copy (reset). */
  adoptConflicts?: boolean;
};

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000, 30000];

export const CONFLICT_MESSAGE =
  'This item changed in another tab or window. Reload it to keep working.';
const OFFLINE_MESSAGE = 'Could not save your changes. Check your connection.';
export const SERVER_MESSAGE =
  'The server could not save this. Copy your text somewhere safe, and tell your admin if it keeps happening.';

/** A 5xx that says the brain is out of reach (the proxy answered for it),
 *  not that the brain failed on this write. */
const UNREACHABLE: ReadonlySet<number> = new Set([502, 503, 504]);

/** State refusals that mean the item cannot change at all right now (it was
 *  submitted, or left draft, elsewhere). Anything else refuses one write. */
const STOP_REASONS: ReadonlySet<string> = new Set(['frozen', 'not-draft']);

/** A write the editor refuses to send (not a brain answer): shown to the
 *  member as it is, and the next edit tries again. */
export class SaveRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveRefused';
  }
}

/** Sort a failed write into what the queue does about it. */
export function classifySaveError(err: unknown): SaveFailure {
  if (err instanceof SaveRefused) return { kind: 'invalid', status: 0, message: err.message };
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as { reason?: unknown; current_rev?: unknown; error?: unknown };
    if (err.status === 401) return { kind: 'auth' };
    if (err.status === 409) {
      if (typeof body.reason === 'string' && body.reason) {
        return { kind: 'state', reason: body.reason, message: refusalMessage(err) ?? err.message };
      }
      return typeof body.current_rev === 'number'
        ? { kind: 'conflict', currentRev: body.current_rev }
        : { kind: 'conflict' };
    }
    if (err.status >= 500 && !UNREACHABLE.has(err.status)) {
      return { kind: 'server', status: err.status };
    }
    if (err.status >= 500 || err.status === 408 || err.status === 429) return { kind: 'network' };
    return { kind: 'invalid', status: err.status, message: refusalMessage(err) ?? err.message };
  }
  // fetch() rejects with a TypeError when the request never got an answer.
  return { kind: 'network' };
}

export type CommitResult = { ok: true } | { ok: false; failure: SaveFailure };

export type AutosaveQueue<T> = {
  /** A local edit happened: arm the debounce. */
  changed(): void;
  /** Save now. True once everything read at call time is on the server. */
  flush(): Promise<boolean>;
  /** Run another write of the latest document (Save version) in the same
   *  chain, with the same etag and 409 handling. On success the queue takes
   *  the sent document as saved and the returned rev as its etag. */
  commit(send: AutosaveSend<T>): Promise<CommitResult>;
  /** Take the server's copy as the new base (a reload): clears a stop. */
  reset(saved: T, rev: number): void;
  isDirty(): boolean;
  rev(): number;
  state(): AutosaveState;
  /** Resolves when nothing is on the wire or queued. */
  settled(): Promise<void>;
};

export function createAutosaveQueue<T>(opts: AutosaveOptions<T>): AutosaveQueue<T> {
  const keyOf = opts.key ?? ((d: T) => JSON.stringify(d));
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let savedDoc = opts.saved;
  let savedKey = keyOf(opts.saved);
  let rev = opts.rev;
  let stopped: { reason: string; message: string } | null = null;
  let failed: string | null = null;
  let retryAttempt = 0;
  /** Brain failures (a non-proxy 5xx) in a row, across writes. */
  let serverFailures = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pendingSince: number | null = null;
  let busy = 0;
  let chain: Promise<void> = Promise.resolve();
  let last = '';

  const isDirty = () => keyOf(opts.read()) !== savedKey;

  /** `edited`: a change just happened, so skip re-keying the document (a
   *  page or a table is JSON-keyed, and this runs on every keystroke). */
  const current = (edited = false): AutosaveState => {
    if (stopped) return { status: 'stopped', ...stopped };
    if (busy > 0) return { status: 'saving' };
    if (retry) return { status: 'retrying', attempt: retryAttempt };
    if (failed) return { status: 'failed', message: failed };
    return edited || isDirty() ? { status: 'pending' } : { status: 'saved' };
  };

  const emit = (edited = false) => {
    if (!opts.onState) return;
    const s = current(edited);
    const k = JSON.stringify(s);
    if (k === last) return;
    last = k;
    opts.onState(s);
  };

  const clearDebounce = () => {
    if (debounce) clearTimeout(debounce);
    debounce = null;
  };
  const clearRetry = () => {
    if (retry) clearTimeout(retry);
    retry = null;
  };

  const arm = () => {
    clearDebounce();
    if (stopped) return;
    const now = Date.now();
    if (pendingSince === null) pendingSince = now;
    const wait =
      opts.maxWaitMs !== undefined && now - pendingSince >= opts.maxWaitMs ? 0 : opts.debounceMs;
    debounce = setTimeout(() => {
      debounce = null;
      void flush();
    }, wait);
  };

  const scheduleRetry = () => {
    clearRetry();
    if (retryAttempt >= delays.length) {
      // Out of retries: say so, and let the next edit (or a flush) try again.
      retryAttempt = 0;
      failed = OFFLINE_MESSAGE;
      return;
    }
    const wait = delays[retryAttempt]!;
    retryAttempt += 1;
    retry = setTimeout(() => {
      retry = null;
      void flush();
    }, wait);
  };

  /** Write `doc` with `send`, adopting a stale etag once. */
  const attempt = async (doc: T, key: string, send: AutosaveSend<T>): Promise<CommitResult> => {
    let adopted = false;
    for (;;) {
      try {
        const res = await send(doc, rev, savedDoc);
        rev = res.rev;
        savedDoc = doc;
        savedKey = key;
        failed = null;
        retryAttempt = 0;
        serverFailures = 0;
        clearRetry();
        return { ok: true };
      } catch (err) {
        const failure = classifySaveError(err);
        serverFailures = failure.kind === 'server' ? serverFailures + 1 : 0;
        if (
          failure.kind === 'conflict' &&
          !adopted &&
          failure.currentRev !== undefined &&
          opts.adoptConflicts !== false
        ) {
          rev = failure.currentRev;
          adopted = true;
          continue;
        }
        if (failure.kind === 'conflict') {
          stopped = { reason: 'conflict', message: CONFLICT_MESSAGE };
        } else if (failure.kind === 'state' && STOP_REASONS.has(failure.reason)) {
          stopped = { reason: failure.reason, message: failure.message };
        } else if (failure.kind === 'state') {
          // A refusal of THIS write (embed on Save version, quota): the draft
          // itself can still change, so autosave stays on.
          failed = failure.message;
        } else if (failure.kind === 'network') {
          scheduleRetry();
        } else if (failure.kind === 'server') {
          // Once may be a blip; twice in a row the brain refuses this write,
          // and retrying for a minute only hides that.
          if (serverFailures >= 2) {
            clearRetry();
            retryAttempt = 0;
            failed = SERVER_MESSAGE;
          } else {
            scheduleRetry();
          }
        } else if (failure.kind === 'invalid') {
          failed = failure.message;
        }
        opts.onFailure?.(failure);
        return { ok: false, failure };
      }
    }
  };

  /** One task at a time, in call order. */
  const exclusive = <R>(task: () => Promise<R>): Promise<R> => {
    busy += 1;
    emit();
    const run = async () => {
      try {
        return await task();
      } finally {
        busy -= 1;
        emit();
      }
    };
    const p = chain.then(run, run);
    chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  };

  /** After a write: typing that landed while it was on the wire stays dirty
   *  and gets its own save. */
  const settle = () => {
    if (isDirty()) arm();
    else pendingSince = null;
  };

  const saveLatest = async (): Promise<boolean> => {
    if (stopped) return false;
    const doc = opts.read();
    const key = keyOf(doc);
    if (key === savedKey) {
      failed = null;
      pendingSince = null;
      return true;
    }
    const res = await attempt(doc, key, opts.send);
    if (res.ok) {
      opts.onSaved?.();
      settle();
    }
    return res.ok;
  };

  function flush(): Promise<boolean> {
    clearDebounce();
    clearRetry();
    return exclusive(saveLatest);
  }

  return {
    changed() {
      if (!stopped) arm();
      emit(true);
    },
    flush,
    commit(send) {
      clearDebounce();
      clearRetry();
      return exclusive(async () => {
        if (stopped) return { ok: false, failure: { kind: 'state', ...stopped } } as const;
        const doc = opts.read();
        const res = await attempt(doc, keyOf(doc), send);
        if (res.ok) settle();
        return res;
      });
    },
    reset(saved, nextRev) {
      clearDebounce();
      clearRetry();
      savedDoc = saved;
      savedKey = keyOf(saved);
      rev = nextRev;
      stopped = null;
      failed = null;
      retryAttempt = 0;
      serverFailures = 0;
      pendingSince = null;
      emit();
    },
    isDirty,
    rev: () => rev,
    state: current,
    settled: () => chain,
  };
}

/** What Save version says for a failure the queue's state does not already
 *  say (a refusal does, through the state): null for those. */
export function versionFailureText(failure: SaveFailure): string | null {
  if (failure.kind === 'network') return 'Could not save the version. Check your connection.';
  if (failure.kind === 'server') return 'The server could not save the version. Try again.';
  return null;
}

/**
 * Should leaving the page ask first? Only while the editor holds typing the
 * brain has not got AND saving is in trouble (failing, retrying or stopped):
 * the leave flush sends ordinary pending typing on the way out, so a prompt
 * then would only nag. Pure, so the rule is unit-tested; the editor hook
 * asks it from `beforeunload`.
 */
export function leaveNeedsWarning(state: AutosaveState, dirty: boolean): boolean {
  if (!dirty) return false;
  return state.status === 'failed' || state.status === 'retrying' || state.status === 'stopped';
}

/**
 * The last queue each item had, so reopening an item waits for the save its
 * editor started on the way out (the leave flush) before reading it back.
 * Without this the GET can overtake the PUT and show the old text, and the
 * next keystroke would then send that old text on top of the saved words.
 */
const lastQueue = new Map<string, AutosaveQueue<unknown>>();

export function trackMemberSaves(id: string, queue: AutosaveQueue<unknown>): void {
  lastQueue.set(id, queue);
}

export function memberSavesSettled(id: string): Promise<void> {
  return lastQueue.get(id)?.settled() ?? Promise.resolve();
}
