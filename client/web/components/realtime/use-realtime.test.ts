import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A member's tab holds ONE live-update connection (W5c): the rail's
 * subscribers and the member workspace's all share /api/member/realtime.
 */
const opened = vi.hoisted(() => [] as { path: string; onMessage: (d: string) => void }[]);
const stopped = vi.hoisted(() => ({ count: 0 }));

vi.mock('@mantle/web-ui/api-fetch', async (orig) => ({
  ...(await orig<typeof import('@mantle/web-ui/api-fetch')>()),
  apiEventStream: (path: string, onMessage: (d: string) => void) => {
    opened.push({ path, onMessage });
    return () => {
      stopped.count += 1;
    };
  },
}));

const { subscribeRealtime } = await import('./use-realtime');
const { MEMBER_REALTIME_PATH } = await import('@/lib/realtime-stream');

afterEach(() => {
  vi.useRealTimers();
});

describe('one shared stream per tab', () => {
  it("the rail and the member workspace share the member's one connection", () => {
    vi.useFakeTimers();
    const rail: string[] = [];
    const space: string[] = [];
    // The rail's badge (one type) and the workspace (every type).
    const offRail = subscribeRealtime(MEMBER_REALTIME_PATH, {
      types: ['pending_tool_call'],
      cb: (c) => rail.push(c.id),
    });
    const offSpace = subscribeRealtime(MEMBER_REALTIME_PATH, {
      types: null,
      cb: (c) => space.push(c.id),
    });
    expect(opened.map((o) => o.path)).toEqual([MEMBER_REALTIME_PATH]);

    opened[0]!.onMessage(JSON.stringify({ type: 'page', id: 'p1' }));
    opened[0]!.onMessage(JSON.stringify({ type: 'pending_tool_call', id: 'q1' }));
    expect(rail).toEqual(['q1']);
    expect(space).toEqual(['p1', 'q1']);

    // Closed once, after the last subscriber leaves (and the linger).
    offSpace();
    offRail();
    expect(stopped.count).toBe(0);
    vi.advanceTimersByTime(5_000);
    expect(stopped.count).toBe(1);
  });

  it('the member workspace opens no stream of its own', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../member/member-workspace.tsx', import.meta.url)),
      'utf8',
    );
    expect(src).not.toContain('apiEventStream');
    expect(src).toContain('useRealtime([]');
  });
});
