import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatDate } from '@mantle/web-ui/lib/format-datetime';
import type { RetiredClientLinkRow } from '../../lib/contract-next';
import { RetiredClientLinks } from './retired-client-links';

/**
 * Retired client links (client logins C3): the old client links the brain
 * retired, listed below the live links in Shared links. Each names its item
 * (a link to it), when it retired, its use and the item's level now; none
 * offers a copy or an open, because the link is dead. An empty list (and a
 * brain before C3, which sends none) shows nothing.
 */
const row = (over: Partial<RetiredClientLinkRow> = {}): RetiredClientLinkRow => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  nodeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  nodeType: 'page',
  title: 'Quarterly report',
  icon: '📄',
  level: 'client',
  createdAt: '2026-03-01T10:00:00.000Z',
  retiredAt: '2026-09-29T08:00:00.000Z',
  viewCount: 12,
  lastViewedAt: '2026-09-20T09:00:00.000Z',
  ...over,
});
const render = (rows: RetiredClientLinkRow[]) =>
  renderToStaticMarkup(createElement(RetiredClientLinks, { rows }));
const NOTE = 'These old links now ask visitors to sign in as a client.';

describe('RetiredClientLinks', () => {
  it('shows nothing when there are none', () => {
    expect(render([])).toBe('');
  });

  it('names the section, with its count and the way to Clients', () => {
    const html = render([row(), row({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })]);
    expect(html).toContain('Retired client links');
    expect(html).toMatch(/Retired client links<\/h3><span[^>]*>2<\/span>/);
    expect(html).toContain(NOTE);
    expect(html).toContain('Add the people who used them in');
    expect(html).toMatch(/<a [^>]*href="\/team-admin\?view=client-logins"[^>]*>Clients<\/a>/);
  });

  it('links each row to its item, with its icon and title', () => {
    const html = render([row()]);
    expect(html).toMatch(
      /<a [^>]*href="\/n\/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"[^>]*>[\s\S]*?📄[\s\S]*?Quarterly report[\s\S]*?<\/a>/,
    );
  });

  it('says when it retired, how much it was used, and the level now', () => {
    const html = render([row()]);
    expect(html).toContain(`retired ${formatDate('2026-09-29T08:00:00.000Z')}`);
    expect(html).toContain(`12 views, last ${formatDate('2026-09-20T09:00:00.000Z')}`);
    expect(html).toContain('Page now at Client');
  });

  it('shows the level an admin changed it to since', () => {
    expect(render([row({ level: 'public' })])).toContain('Page now at Public');
  });

  it('offers no copy and no open: the link is dead', () => {
    const html = render([row()]);
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/Copy link|Open link/);
    expect(html).not.toContain('/s/');
    // Two links only: Clients, and the item itself.
    expect(html.match(/<a /g)).toHaveLength(2);
  });
});

describe('the Shared links panel lists them', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const panel = read('./shared-links-panel.tsx');
  const page = read('../../app/(app)/team-admin/page.tsx');

  it('below the live links, and under the empty note when no link is live', () => {
    expect(panel.match(/<RetiredClientLinks rows=\{retired\} \/>/g)).toHaveLength(2);
    expect(panel).toContain('if (rows.length === 0 && retired.length === 0) {');
  });

  it("from the tab's answer, where a brain before C3 sends none", () => {
    expect(panel).toContain('retired = [],');
    expect(page).toContain('retired={retiredLinksOf(q.data)}');
  });

  it('keeps them when a revoke takes a live link out of the query', () => {
    expect(panel).toContain('d ? { ...d, shares: d.shares.filter((x) => x.id !== gone) } : d,');
  });

  it('offers Copy and Open for the selected live link only', () => {
    expect(panel.match(/aria-label="Copy link"/g)).toHaveLength(1);
    expect(panel.match(/aria-label="Open link"/g)).toHaveLength(1);
    expect(read('./retired-client-links.tsx')).not.toMatch(/Copy|ExternalLink|<Button/);
  });
});
