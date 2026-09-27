import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  CONFLICT_MESSAGE,
  SaveRefused,
  classifySaveError,
  createAutosaveQueue,
  memberSavesSettled,
  trackMemberSaves,
  type AutosaveSend,
  type AutosaveState,
} from './member-autosave';

type Doc = { text: string };

/** A deferred send: each call parks until the test settles it. */
function deferredSend() {
  const calls: {
    doc: Doc;
    rev: number;
    base: Doc;
    resolve: (rev: number) => void;
    reject: (err: unknown) => void;
  }[] = [];
  const send: AutosaveSend<Doc> = (doc, rev, base) =>
    new Promise((resolve, reject) => {
      calls.push({ doc, rev, base, resolve: (r) => resolve({ rev: r }), reject });
    });
  return { send, calls };
}

/** Lets queued promise callbacks run (fake timers do not move microtasks). */
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup(send: AutosaveSend<Doc>, extra: { maxWaitMs?: number } = {}) {
  let doc: Doc = { text: 'a' };
  const states: AutosaveState[] = [];
  const q = createAutosaveQueue<Doc>({
    read: () => doc,
    saved: { text: 'a' },
    rev: 1,
    send,
    debounceMs: 800,
    onState: (s) => states.push(s),
    ...extra,
  });
  const type = (text: string) => {
    doc = { text };
    q.changed();
  };
  return { q, type, states, read: () => doc };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('member autosave: debounce', () => {
  it('saves once after the debounce, with the latest text', async () => {
    const { send, calls } = deferredSend();
    const { type } = setup(send);
    type('ab');
    type('abc');
    await vi.advanceTimersByTimeAsync(799);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.doc).toEqual({ text: 'abc' });
    expect(calls[0]!.rev).toBe(1);
  });

  it('saves during continuous editing once maxWait has passed', async () => {
    const { send, calls } = deferredSend();
    const { type } = setup(send, { maxWaitMs: 2000 });
    for (let i = 0; i < 6; i++) {
      type(`t${i}`);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('member autosave: one save in flight', () => {
  it('a second save waits for the first, then sends only the latest on the fresh rev', async () => {
    const { send, calls } = deferredSend();
    const { q, type } = setup(send);
    type('b');
    const first = q.flush();
    await tick();
    expect(calls).toHaveLength(1);

    // Two more triggers while the first is on the wire: a blur and the timer.
    type('bc');
    const second = q.flush();
    type('bcd');
    const third = q.flush();
    await tick();
    expect(calls).toHaveLength(1); // nothing overlaps the first

    calls[0]!.resolve(2);
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.doc).toEqual({ text: 'bcd' }); // the latest, not 'bc'
    expect(calls[1]!.rev).toBe(2); // the etag the first answered with
    calls[1]!.resolve(3);
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true]);
    await tick();
    expect(calls).toHaveLength(2); // the third found nothing left to send
    expect(q.rev()).toBe(3);
  });

  it('Save version waits for an in-flight draft save and uses its rev', async () => {
    const { send, calls } = deferredSend();
    const { q, type } = setup(send);
    type('b');
    void q.flush();
    await tick();
    const commitSend = vi.fn<AutosaveSend<Doc>>(async () => ({ rev: 9 }));
    const committed = q.commit(commitSend);
    await tick();
    expect(commitSend).not.toHaveBeenCalled();
    calls[0]!.resolve(5);
    await expect(committed).resolves.toEqual({ ok: true });
    expect(commitSend).toHaveBeenCalledWith({ text: 'b' }, 5, { text: 'b' });
    expect(q.rev()).toBe(9);
  });
});

describe('member autosave: dirty by snapshot', () => {
  it('typing during a request stays dirty and is saved next', async () => {
    const { send, calls } = deferredSend();
    const { q, type, states } = setup(send);
    type('first words');
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(1);

    // The member keeps typing while the PUT is on the wire.
    type('first words and the last ones');
    calls[0]!.resolve(2);
    await tick();

    expect(q.isDirty()).toBe(true);
    expect(states.at(-1)).toEqual({ status: 'pending' });
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.doc).toEqual({ text: 'first words and the last ones' });
    calls[1]!.resolve(3);
    await tick();
    expect(q.isDirty()).toBe(false);
    expect(states.at(-1)).toEqual({ status: 'saved' });
  });

  it('re-arms even without another change event (the in-flight typing is not lost)', async () => {
    const { send, calls } = deferredSend();
    let doc: Doc = { text: 'a' };
    const q = createAutosaveQueue<Doc>({
      read: () => doc,
      saved: doc,
      rev: 1,
      send,
      debounceMs: 800,
    });
    doc = { text: 'ab' };
    q.changed();
    await vi.advanceTimersByTimeAsync(800);
    doc = { text: 'abc' }; // an edit whose change event was already consumed
    calls[0]!.resolve(2);
    await tick();
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.doc).toEqual({ text: 'abc' });
  });
});

describe('member autosave: 409 and network failures', () => {
  it('adopts current_rev from a stale-etag 409 and sends the local text again', async () => {
    const send = vi
      .fn<AutosaveSend<Doc>>()
      .mockRejectedValueOnce(
        new ApiError('The draft changed since you loaded it.', 409, { current_rev: 7 }),
      )
      .mockResolvedValueOnce({ rev: 8 });
    const { q, type } = setup(send);
    type('mine');
    await expect(q.flush()).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual({ text: 'mine' });
    expect(send.mock.calls[1]![1]).toBe(7);
    expect(q.rev()).toBe(8);
    expect(q.state()).toEqual({ status: 'saved' });
  });

  it('a second conflict in a row stops autosave with a clear state', async () => {
    const conflict = () => new ApiError('changed', 409, { current_rev: 7 });
    const send = vi
      .fn<AutosaveSend<Doc>>()
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict());
    const { q, type } = setup(send);
    type('mine');
    await expect(q.flush()).resolves.toBe(false);
    expect(q.state()).toEqual({ status: 'stopped', reason: 'conflict', message: CONFLICT_MESSAGE });
    type('more');
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(2); // stopped: no more writes
    q.reset({ text: 'server' }, 11);
    expect(q.state()).toEqual({ status: 'pending' });
  });

  it('a state refusal (409 frozen) stops at once, no retry', async () => {
    const send = vi.fn<AutosaveSend<Doc>>().mockRejectedValue(
      new ApiError('Submitted for review: it cannot change now.', 409, {
        error: 'Submitted for review: it cannot change now.',
        reason: 'frozen',
      }),
    );
    const { q, type } = setup(send);
    type('late words');
    await expect(q.flush()).resolves.toBe(false);
    expect(q.state()).toEqual({
      status: 'stopped',
      reason: 'frozen',
      message: 'Submitted for review: it cannot change now.',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a refusal of one write (embed on Save version) leaves autosave on', async () => {
    const send = vi.fn<AutosaveSend<Doc>>().mockResolvedValue({ rev: 2 });
    const { q, type } = setup(send);
    type('links a foreign item');
    const res = await q.commit(async () => {
      throw new ApiError('This page uses items you cannot share.', 409, {
        error: 'This page uses items you cannot share.',
        reason: 'embed',
        ids: ['x'],
      });
    });
    expect(res.ok).toBe(false);
    expect(q.state()).toEqual({
      status: 'failed',
      message: 'This page uses items you cannot share.',
    });
    type('links a foreign item, then more');
    await vi.advanceTimersByTimeAsync(800);
    expect(send).toHaveBeenCalledTimes(1);
    expect(q.state()).toEqual({ status: 'saved' });
  });

  it('a full space (409 quota) fails that write with a clear sentence, autosave stays on', async () => {
    const send = vi
      .fn<AutosaveSend<Doc>>()
      .mockRejectedValueOnce(new ApiError('409 Conflict', 409, { reason: 'quota' }))
      .mockResolvedValueOnce({ rev: 2 });
    const { q, type } = setup(send);
    type('a big row');
    await expect(q.flush()).resolves.toBe(false);
    expect(q.state()).toEqual({
      status: 'failed',
      message: 'Your space is full. Delete something to make room, then try again.',
    });
    type('a big row, trimmed');
    await vi.advanceTimersByTimeAsync(800);
    expect(send).toHaveBeenCalledTimes(2);
    expect(q.state()).toEqual({ status: 'saved' });
  });

  it('a network failure retries with backoff and then saves', async () => {
    const send = vi
      .fn<AutosaveSend<Doc>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError('Bad gateway', 502))
      .mockResolvedValueOnce({ rev: 2 });
    const { q, type } = setup(send, {});
    type('offline words');
    await expect(q.flush()).resolves.toBe(false);
    expect(q.state()).toEqual({ status: 'retrying', attempt: 1 });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2]![0]).toEqual({ text: 'offline words' });
    expect(q.state()).toEqual({ status: 'saved' });
  });

  it('gives up after the last backoff step and says so', async () => {
    const send = vi.fn<AutosaveSend<Doc>>().mockRejectedValue(new TypeError('Failed to fetch'));
    let doc: Doc = { text: 'a' };
    const q = createAutosaveQueue<Doc>({
      read: () => doc,
      saved: doc,
      rev: 1,
      send,
      debounceMs: 800,
      retryDelaysMs: [10, 20],
    });
    doc = { text: 'b' };
    await q.flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(3);
    expect(q.state().status).toBe('failed');
  });

  it('a refusal the editor raises itself shows its message', () => {
    expect(classifySaveError(new SaveRefused('Not here.'))).toEqual({
      kind: 'invalid',
      status: 0,
      message: 'Not here.',
    });
    expect(classifySaveError(new ApiError('unauthorized', 401))).toEqual({ kind: 'auth' });
    expect(classifySaveError(new ApiError('Too big', 413))).toEqual({
      kind: 'invalid',
      status: 413,
      message: 'Too big',
    });
  });
});

describe('member autosave: flush before submit', () => {
  it('flush resolves only once the typing is on the server', async () => {
    const server: { text: string | null } = { text: 'a' };
    const send: AutosaveSend<Doc> = (doc) =>
      new Promise((resolve) =>
        setTimeout(() => {
          server.text = doc.text;
          resolve({ rev: 2 });
        }, 300),
      );
    const { q, type } = setup(send);
    type('the final note'); // inside the debounce window
    const submitted: (string | null)[] = [];
    const submit = async () => {
      if (await q.flush()) submitted.push(server.text);
    };
    const done = submit();
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(submitted).toEqual(['the final note']);
  });

  it('flush waits out an in-flight save and then sends what came after it', async () => {
    const { send, calls } = deferredSend();
    const { q, type } = setup(send);
    type('one');
    await vi.advanceTimersByTimeAsync(800); // the timer's save is on the wire
    type('one two');
    let flushed: boolean | null = null;
    void q.flush().then((ok) => (flushed = ok));
    calls[0]!.resolve(2);
    await tick();
    expect(flushed).toBeNull(); // 'one two' is not on the server yet
    calls[1]!.resolve(3);
    await tick();
    expect(flushed).toBe(true);
    expect(calls[1]!.doc).toEqual({ text: 'one two' });
  });

  it('reopening an item waits for the save its editor started on the way out', async () => {
    const { send, calls } = deferredSend();
    const { q, type } = setup(send);
    trackMemberSaves('item-1', q as never);
    type('typed then left');
    void q.flush(); // the leave flush
    let settled = false;
    void memberSavesSettled('item-1').then(() => (settled = true));
    await tick();
    expect(settled).toBe(false);
    calls[0]!.resolve(2);
    await tick();
    expect(settled).toBe(true);
  });
});
