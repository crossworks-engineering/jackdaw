import { describe, expect, it } from 'vitest';
import { applyStatusToTrail, createFrameFlusher, type ThoughtEvent } from './use-turn-stream';

const grounded = (over: Partial<ThoughtEvent> = {}): ThoughtEvent => ({
  stepId: '1',
  kind: 'brain',
  label: 'Searching your brain for “cars”…',
  elapsedMs: 100,
  ...over,
});

describe('applyStatusToTrail', () => {
  it('appends a new step', () => {
    const out = applyStatusToTrail([], grounded());
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('Searching your brain for “cars”…');
  });

  it('upserts a narrated upgrade in place, preserving elapsedMs and setting narrated', () => {
    const trail = [grounded()];
    const out = applyStatusToTrail(
      trail,
      grounded({ label: 'Let me dig through your notes on cars…', narrated: true, elapsedMs: 900 }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('Let me dig through your notes on cars…');
    expect(out[0]!.narrated).toBe(true);
    // The step started when its grounded line arrived — the upgrade keeps that.
    expect(out[0]!.elapsedMs).toBe(100);
  });

  it('keeps narrated on a step once set (identical re-delivery is a no-op)', () => {
    const one = applyStatusToTrail(
      [grounded()],
      grounded({ label: 'On it…', narrated: true, elapsedMs: 500 }),
    );
    const two = applyStatusToTrail(
      one,
      grounded({ label: 'On it…', narrated: true, elapsedMs: 600 }),
    );
    expect(two).toBe(one); // same reference — nothing changed
    expect(two[0]!.narrated).toBe(true);
  });

  it('upserts a late narrated event onto its row even after later steps appended', () => {
    const trail = [grounded(), grounded({ stepId: '2', label: 'Working on it…', elapsedMs: 300 })];
    const out = applyStatusToTrail(
      trail,
      grounded({ label: 'Let me dig through your notes on cars…', narrated: true }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.narrated).toBe(true);
    expect(out[1]!.narrated).toBeUndefined();
  });

  it('collapses a consecutive duplicate append', () => {
    const trail = [grounded({ stepId: undefined })];
    const out = applyStatusToTrail(trail, grounded({ stepId: undefined, elapsedMs: 400 }));
    expect(out).toBe(trail);
  });

  it('does NOT swallow a narrated line identical in text to the previous grounded one', () => {
    const trail = [grounded({ stepId: undefined })];
    const out = applyStatusToTrail(trail, grounded({ stepId: undefined, narrated: true }));
    expect(out).toHaveLength(2);
    expect(out[1]!.narrated).toBe(true);
  });
});

describe('createFrameFlusher', () => {
  /** A fake rAF: nothing runs until `tick()` is called. */
  const fakeRaf = () => {
    let next = 1;
    const queue = new Map<number, () => void>();
    return {
      raf: (cb: () => void) => {
        const id = next++;
        queue.set(id, cb);
        return id;
      },
      caf: (id: number) => void queue.delete(id),
      tick: () => {
        const due = [...queue.values()];
        queue.clear();
        for (const cb of due) cb();
      },
      get pending() {
        return queue.size;
      },
    };
  };

  it('collapses many writes in a frame into ONE publish', () => {
    const clock = fakeRaf();
    let published = 0;
    const f = createFrameFlusher(() => published++, clock.raf, clock.caf);
    for (let i = 0; i < 50; i++) f.schedule();
    expect(published).toBe(0); // nothing until the frame runs
    expect(clock.pending).toBe(1); // and only one frame was ever queued
    clock.tick();
    expect(published).toBe(1);
  });

  it('publishes again on the next frame', () => {
    const { raf, caf, tick } = fakeRaf();
    let published = 0;
    const f = createFrameFlusher(() => published++, raf, caf);
    f.schedule();
    tick();
    f.schedule();
    tick();
    expect(published).toBe(2);
  });

  it('flushNow publishes immediately and drops the queued frame', () => {
    const { raf, caf, tick } = fakeRaf();
    let published = 0;
    const f = createFrameFlusher(() => published++, raf, caf);
    f.schedule();
    f.flushNow();
    expect(published).toBe(1);
    // The queued frame must not publish a second, stale time — this is what
    // keeps a terminal event's exact token count from being overwritten by the
    // estimate a pending frame would have written.
    tick();
    expect(published).toBe(1);
  });

  it('cancel drops the frame without publishing', () => {
    const { raf, caf, tick } = fakeRaf();
    let published = 0;
    const f = createFrameFlusher(() => published++, raf, caf);
    f.schedule();
    f.cancel();
    tick();
    expect(published).toBe(0);
  });

  it('can be scheduled again after a cancel', () => {
    const { raf, caf, tick } = fakeRaf();
    let published = 0;
    const f = createFrameFlusher(() => published++, raf, caf);
    f.schedule();
    f.cancel();
    f.schedule();
    tick();
    expect(published).toBe(1);
  });
});
