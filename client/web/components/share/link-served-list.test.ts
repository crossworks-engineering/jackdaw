/**
 * The open link's served list (W5b2 contract 30 and 32): each candidate with
 * a tick, the count, the items the user cannot change and the folder cap.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ServeRow } from '../../lib/grants';
import { LinkServedList } from './link-served-list';

const row = (over: Partial<ServeRow> = {}): ServeRow => ({
  nodeId: 'a',
  title: 'Photo',
  kind: 'file',
  served: false,
  ...over,
});

const render = (rows: ServeRow[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(LinkServedList, {
      rows,
      elsewhere: [],
      type: 'page',
      busy: false,
      onToggle: () => {},
      ...extra,
    }),
  );

describe('LinkServedList', () => {
  it('lists each candidate with a tick and its kind', () => {
    const html = render([
      row(),
      row({ nodeId: 'b', title: 'Site plan', kind: 'draw', served: true }),
    ]);
    expect(html).toContain('aria-label="Show Photo"');
    expect(html).toContain('aria-label="Show Site plan"');
    expect(html).toContain('drawing');
    expect(html).toContain('data-state="checked"');
    expect(html).toContain('The link also shows one item.');
    expect(html).toContain('Tick all');
  });

  it('offers Clear all when every item is ticked', () => {
    const html = render([row({ served: true }), row({ nodeId: 'b', served: true })]);
    expect(html).toContain('Clear all');
    expect(html).not.toContain('Tick all');
  });

  it('with no candidates: only the count, and the items it cannot change', () => {
    const html = render([], { elsewhere: [{ title: null }, { title: null }] });
    expect(html).not.toContain('<ul');
    expect(html).toContain('The link also shows 2 items.');
    expect(html).toContain('2 more items stay on the list.');
  });

  it('a folder says when its list is cut at 500', () => {
    const rows = Array.from({ length: 500 }, (_, i) => row({ nodeId: `n${i}` }));
    expect(render(rows, { type: 'branch' })).toContain(
      'Only the first 500 items in this folder that you can edit are listed here.',
    );
  });
});
