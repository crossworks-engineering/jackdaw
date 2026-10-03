import { describe, expect, it } from 'vitest';
import { blockCounts, findContextTrace, shortKey } from './context-trace';

const trace = { v: 1, stages: [], rows: [], ms: 3 };

describe('context trace helpers', () => {
  it('finds the trace in a load_context or a search_chunks output', () => {
    expect(findContextTrace({ snapshot: { trace } })).toBe(trace);
    expect(findContextTrace({ count: 3, trace })).toBe(trace);
    expect(findContextTrace({ snapshot: {} })).toBeNull();
    expect(findContextTrace({ trace: { v: 2, stages: [], rows: [] } })).toBeNull();
    expect(findContextTrace(null)).toBeNull();
  });

  it('shortens ids and keeps the passage ordinal', () => {
    expect(shortKey('0f8fad5b-d9cb-469f-a165-70867728950e:12')).toBe('0f8fad5b:12');
    expect(shortKey('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('0f8fad5b');
  });

  it('counts kept and dropped per block', () => {
    const rows = [
      { b: 'fact', k: 'a', out: 'kept', at: 'facts', why: 'sent' },
      { b: 'chunk', k: 'b', out: 'dropped', at: 'select', why: 'limit:8' },
      { b: 'fact', k: 'c', out: 'dropped', at: 'facts', why: 'guard:0.85' },
    ] as const;
    expect(blockCounts([...rows])).toEqual([
      { b: 'fact', kept: 1, dropped: 1 },
      { b: 'chunk', kept: 0, dropped: 1 },
    ]);
  });
});
