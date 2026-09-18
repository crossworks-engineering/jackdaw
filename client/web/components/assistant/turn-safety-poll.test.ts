import { describe, expect, it, vi } from 'vitest';
import {
  findTurnOutboundRow,
  startTurnSafetyPoll,
  turnSinceIso,
  type SafetyPollRow,
} from './turn-safety-poll';

const row = (over: Partial<SafetyPollRow> & Pick<SafetyPollRow, 'id'>): SafetyPollRow => ({
  direction: 'outbound',
  text: '',
  createdAt: '2026-09-18T09:00:00.000Z',
  status: 'complete',
  ...over,
});

/** A hand-cranked interval so a test decides exactly when a tick happens. */
function manualTimers() {
  let fn: (() => void) | null = null;
  return {
    timers: {
      setInterval: (f: () => void) => {
        fn = f;
        return 1;
      },
      clearInterval: () => {
        fn = null;
      },
    },
    /** Fire one tick and let its async body finish. */
    tick: async () => {
      fn?.();
      await new Promise((r) => setTimeout(r, 0));
    },
    armed: () => fn !== null,
  };
}

describe('findTurnOutboundRow', () => {
  it('prefers the exact outbound id over everything else', () => {
    const rows = [
      row({ id: 'old', createdAt: '2026-09-18T09:00:05.000Z' }),
      row({ id: 'mine', createdAt: '2026-09-18T08:00:00.000Z', status: 'pending' }),
    ];
    const hit = findTurnOutboundRow(rows, {
      outboundId: 'mine',
      sinceIso: '2026-09-18T09:00:00.000Z',
    });
    expect(hit?.id).toBe('mine');
  });

  it('never matches an inbound row by id', () => {
    const rows = [row({ id: 'x', direction: 'inbound' })];
    expect(findTurnOutboundRow(rows, { outboundId: 'x', sinceIso: '1970-01-01' })).toBeUndefined();
  });

  it('pairs with this turn’s inbound row, so the previous reply inside the margin is excluded', () => {
    // The margin pulled `since` back far enough to include the PREVIOUS turn's
    // finished reply. It was written before this turn's inbound row, so it must
    // not be reported as this turn's answer.
    const rows = [
      row({ id: 'prev-reply', createdAt: '2026-09-18T09:00:01.000Z', text: 'old answer' }),
      row({ id: 'my-q', direction: 'inbound', createdAt: '2026-09-18T09:00:02.500Z' }),
      row({ id: 'my-reply', createdAt: '2026-09-18T09:00:02.600Z', status: 'pending' }),
    ];
    const hit = findTurnOutboundRow(rows, { sinceIso: '2026-09-18T09:00:00.000Z' });
    expect(hit?.id).toBe('my-reply');
    expect(hit?.status).toBe('pending');
  });

  it('returns nothing until this turn’s inbound row exists', () => {
    const rows = [row({ id: 'prev-reply', createdAt: '2026-09-18T09:00:01.000Z' })];
    expect(findTurnOutboundRow(rows, { sinceIso: '2026-09-18T09:00:00.000Z' })).toBeUndefined();
  });

  it('is order-independent (the API returns newest first)', () => {
    const rows = [
      row({ id: 'my-reply', createdAt: '2026-09-18T09:00:03.000Z' }),
      row({ id: 'my-q', direction: 'inbound', createdAt: '2026-09-18T09:00:02.000Z' }),
      row({ id: 'ancient', createdAt: '2026-09-17T09:00:00.000Z' }),
    ];
    expect(findTurnOutboundRow(rows, { sinceIso: '2026-09-18T09:00:00.000Z' })?.id).toBe(
      'my-reply',
    );
  });
});

describe('turnSinceIso', () => {
  it('uses the server clock from the Date header, minus elapsed and margin', () => {
    // Client clock is an hour ahead of the server: the client clock must not leak in.
    const iso = turnSinceIso({
      serverDateHeader: 'Fri, 18 Sep 2026 09:00:10 GMT',
      firstSentAtMs: Date.parse('2026-09-18T10:00:06.000Z'),
      nowMs: Date.parse('2026-09-18T10:00:10.000Z'),
    });
    // server now 09:00:10 − 4 s elapsed − 2 s margin
    expect(iso).toBe('2026-09-18T09:00:04.000Z');
  });

  it('falls back to the client clock when the header is unreadable (cross-origin)', () => {
    const iso = turnSinceIso({
      serverDateHeader: null,
      firstSentAtMs: Date.parse('2026-09-18T09:00:06.000Z'),
      nowMs: Date.parse('2026-09-18T09:00:10.000Z'),
    });
    expect(iso).toBe('2026-09-18T09:00:04.000Z');
  });

  it('ignores a garbage header', () => {
    const iso = turnSinceIso({
      serverDateHeader: 'not a date',
      firstSentAtMs: Date.parse('2026-09-18T09:00:06.000Z'),
      nowMs: Date.parse('2026-09-18T09:00:06.000Z'),
      marginMs: 0,
    });
    expect(iso).toBe('2026-09-18T09:00:06.000Z');
  });
});

describe('startTurnSafetyPoll', () => {
  const since = '2026-09-18T09:00:00.000Z';
  const q = row({ id: 'q', direction: 'inbound', createdAt: '2026-09-18T09:00:01.000Z' });

  it('completes the turn from the durable row when the stream never says a word', async () => {
    // The field failure: a proxy holds the event stream back, so NO stream event
    // ever reaches the client. The poll alone must finish the turn, with the
    // row's text (there is no streamed buffer to fall back on).
    const t = manualTimers();
    const pages: SafetyPollRow[][] = [
      [q, row({ id: 'r', createdAt: '2026-09-18T09:00:01.100Z', status: 'pending' })],
      [q, row({ id: 'r', createdAt: '2026-09-18T09:00:01.100Z', status: 'pending' })],
      [q, row({ id: 'r', createdAt: '2026-09-18T09:00:01.100Z', text: 'The durable reply.' })],
    ];
    const fetchRows = vi.fn(async () => pages.shift() ?? []);
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    startTurnSafetyPoll({
      fetchRows,
      getOutboundId: () => null, // turn-start never arrived either
      sinceIso: since,
      onComplete,
      onFailed,
      timers: t.timers,
    });

    await t.tick();
    await t.tick();
    expect(onComplete).not.toHaveBeenCalled();
    await t.tick();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0].text).toBe('The durable reply.');
    expect(onFailed).not.toHaveBeenCalled();
    // It stops itself: no further requests once the turn is settled.
    expect(t.armed()).toBe(false);
    await t.tick();
    expect(fetchRows).toHaveBeenCalledTimes(3);
  });

  it('reports a failed row', async () => {
    const t = manualTimers();
    const onFailed = vi.fn();
    startTurnSafetyPoll({
      fetchRows: async () => [
        q,
        row({ id: 'r', createdAt: '2026-09-18T09:00:02.000Z', status: 'failed', error: 'boom' }),
      ],
      getOutboundId: () => 'r',
      sinceIso: since,
      onComplete: vi.fn(),
      onFailed,
      timers: t.timers,
    });
    await t.tick();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0]![0].error).toBe('boom');
  });

  it('picks up the outbound id when the stream learns it late', async () => {
    const t = manualTimers();
    let id: string | null = null;
    const onComplete = vi.fn();
    startTurnSafetyPoll({
      // No inbound row in the page, so only the id can match.
      fetchRows: async () => [row({ id: 'r', createdAt: '2026-09-18T09:00:02.000Z' })],
      getOutboundId: () => id,
      sinceIso: since,
      onComplete,
      onFailed: vi.fn(),
      timers: t.timers,
    });
    await t.tick();
    expect(onComplete).not.toHaveBeenCalled();
    id = 'r';
    await t.tick();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('survives a failing fetch and tries again next tick', async () => {
    const t = manualTimers();
    let calls = 0;
    const onComplete = vi.fn();
    startTurnSafetyPoll({
      fetchRows: async () => {
        calls += 1;
        if (calls === 1) throw new Error('network');
        return [q, row({ id: 'r', createdAt: '2026-09-18T09:00:02.000Z' })];
      },
      getOutboundId: () => null,
      sinceIso: since,
      onComplete,
      onFailed: vi.fn(),
      timers: t.timers,
    });
    await t.tick();
    expect(onComplete).not.toHaveBeenCalled();
    await t.tick();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('never stacks requests: a slow fetch skips the overlapping tick', async () => {
    const t = manualTimers();
    let release: (rows: SafetyPollRow[]) => void = () => {};
    const fetchRows = vi.fn(
      () =>
        new Promise<SafetyPollRow[]>((r) => {
          release = r;
        }),
    );
    startTurnSafetyPoll({
      fetchRows,
      getOutboundId: () => null,
      sinceIso: since,
      onComplete: vi.fn(),
      onFailed: vi.fn(),
      timers: t.timers,
    });
    await t.tick();
    await t.tick(); // first fetch still hanging
    expect(fetchRows).toHaveBeenCalledTimes(1);
    release([]);
    await new Promise((r) => setTimeout(r, 0));
    await t.tick();
    expect(fetchRows).toHaveBeenCalledTimes(2);
  });

  it('fires nothing after stop(), even for a fetch already in flight', async () => {
    const t = manualTimers();
    let release: (rows: SafetyPollRow[]) => void = () => {};
    const onComplete = vi.fn();
    const stop = startTurnSafetyPoll({
      fetchRows: () =>
        new Promise<SafetyPollRow[]>((r) => {
          release = r;
        }),
      getOutboundId: () => null,
      sinceIso: since,
      onComplete,
      onFailed: vi.fn(),
      timers: t.timers,
    });
    await t.tick();
    stop(); // the stream won the race (or the dock unmounted)
    release([q, row({ id: 'r', createdAt: '2026-09-18T09:00:02.000Z' })]);
    await new Promise((r) => setTimeout(r, 0));
    expect(onComplete).not.toHaveBeenCalled();
    stop(); // idempotent
  });

  it('gives up once, only when asked, and only while the row is not terminal', async () => {
    const t = manualTimers();
    let giveUp = false;
    const onGiveUp = vi.fn();
    startTurnSafetyPoll({
      fetchRows: async () => [
        q,
        row({ id: 'r', createdAt: '2026-09-18T09:00:02.000Z', status: 'pending' }),
      ],
      getOutboundId: () => null,
      sinceIso: since,
      onComplete: vi.fn(),
      onFailed: vi.fn(),
      shouldGiveUp: () => giveUp,
      onGiveUp,
      timers: t.timers,
    });
    await t.tick();
    expect(onGiveUp).not.toHaveBeenCalled();
    giveUp = true;
    await t.tick();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(t.armed()).toBe(false);
  });
});
