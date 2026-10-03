import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextTraceView } from './context-trace-view';
import type { ContextTraceLike } from './context-trace';

const trace: ContextTraceLike = {
  v: 1,
  stages: [
    { name: 'search', in: 12, out: 12, ms: 14 },
    { name: 'select', in: 12, out: 8, ms: 2, note: 'limit 8, cut 0.65' },
  ],
  search: { mode: 'hybrid', vectorPool: 50, keywordPool: 3, keyword: 'rare', terms: ['zebulun'] },
  rows: [
    {
      b: 'chunk',
      k: '0f8fad5b-d9cb-469f-a165-70867728950e:4',
      out: 'kept',
      at: 'search',
      why: 'sent',
      arm: 'both',
      vr: 2,
      kr: 1,
      rank: 1,
      d: 0.41,
      s: 2.5,
    },
    {
      b: 'chunk',
      k: '1f8fad5b-d9cb-469f-a165-70867728950e:0',
      out: 'kept',
      at: 'search',
      why: 'sent',
      arm: 'vector',
      would: 'judge:<1',
    },
    {
      b: 'chunk',
      k: '2f8fad5b-d9cb-469f-a165-70867728950e:9',
      out: 'dropped',
      at: 'select',
      why: 'cut:0.65',
      arm: 'keyword',
      kr: 2,
      rescued: true,
    },
  ],
  more: 4,
  ms: 31,
};

describe('ContextTraceView', () => {
  it('shows the stages, each row with its arm and reason, and the shadow verdicts', () => {
    const html = renderToStaticMarkup(createElement(ContextTraceView, { trace }));
    expect(html).toContain('chunk: <span class="text-success-ink">2 kept</span>, 1 dropped');
    expect(html).toContain('search hybrid: vector 50, keyword 3 (rare: zebulun)');
    expect(html).toContain('0f8fad5b:4');
    expect(html).toContain('both (v2 k1)');
    expect(html).toContain('keyword (k2, rescued)');
    expect(html).toContain('select: cut:0.65');
    expect(html).toContain('(shadow: judge:&lt;1)');
    expect(html).toContain('4 more rows not recorded.');
  });
});
