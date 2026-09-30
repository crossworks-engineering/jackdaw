import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientStorageUsage } from '@mantle/client-types';
import { ClientStorageView } from './client-storage';
import { ClientCommentsView } from './client-comments-card';

/**
 * Team admin > Clients: the storage card (total against the limit, each
 * client's use, the recent refusals) and the client comments card (each
 * item a link to where its thread is).
 */
const MB = 1024 * 1024;
const usage: ClientStorageUsage = {
  limits: {
    fileMaxBytes: 20 * MB,
    perClientBytes: 200 * MB,
    dailyUploadBytes: 50 * MB,
    itemLimit: 500,
    totalBytes: 5 * 1024 * MB,
    submitsPerDay: 10,
    openSubmissions: 50,
  },
  totalUsedBytes: 4800 * MB,
  rows: [
    {
      loginId: 'l-1',
      name: 'Pat Client',
      usedBytes: 190 * MB,
      uploadedTodayBytes: 0,
      items: 3,
      openSubmissions: 1,
      former: false,
    },
    {
      loginId: 'l-2',
      name: 'Former client (2)',
      usedBytes: MB,
      uploadedTodayBytes: 0,
      items: 1,
      openSubmissions: 0,
      former: true,
    },
  ],
  refusals: [{ at: '2026-09-29T10:00:00.000Z', loginId: 'l-1', reason: 'storage' }],
};

describe('ClientStorageView', () => {
  it("shows what client apps' databases hold, apart from the client limits", () => {
    const html = renderToStaticMarkup(
      createElement(ClientStorageView, { usage: { ...usage, clientAppDbBytes: 3 * MB } }),
    );
    expect(html).toContain(
      'Client apps&#x27; databases hold 3.0 MB (not counted above; each app has its own cap).',
    );
  });

  it('shows the total against the limit, each client, and the refusals', () => {
    const html = renderToStaticMarkup(createElement(ClientStorageView, { usage }));
    expect(html).toContain('Client storage');
    expect(html).toContain('4.69 GB of 5.00 GB used by all client spaces');
    expect(html).toContain('Pat Client');
    expect(html).toContain('190 MB of 200 MB · 3 of 500 items · 1 waiting for review');
    expect(html).toContain('Former client (2)');
    expect(html).toContain(
      '(deleted: its private items are purged after 30 days, its submitted items count until you accept or discard them)',
    );
    // No app database line when the brain sends none (an older brain).
    expect(html).not.toContain("Client apps' databases");
    // A deleted client is no login: nothing on its row acts on one.
    expect(html).not.toMatch(/<(button|a)\b/);
    expect(html).toContain('Refused in the last 7 days');
    expect(html).toContain('Pat Client · their space is full');
    // Near the total and near a client's cap: the warning ink.
    expect(html.match(/text-warning-ink/g)?.length).toBe(2);
    expect(html).toContain('scrollbar-thin');
  });

  it('leaves the refusals out when there are none', () => {
    const html = renderToStaticMarkup(
      createElement(ClientStorageView, { usage: { ...usage, refusals: [] } }),
    );
    expect(html).not.toContain('Refused in the last 7 days');
  });
});

describe('ClientCommentsView', () => {
  it('lists each item with a link to it, and says who commented last', () => {
    const html = renderToStaticMarkup(
      createElement(ClientCommentsView, {
        activity: {
          rows: [
            {
              nodeId: '13131313-1313-4131-8131-131313131313',
              title: 'Design brief',
              type: 'page',
              lastCommentAt: '2026-09-29T10:00:00.000Z',
              clientComments: 2,
              lastClientName: 'Pat Client',
            },
          ],
        },
      }),
    );
    expect(html).toContain('href="/n/13131313-1313-4131-8131-131313131313"');
    expect(html).toContain('>Design brief<');
    expect(html).toContain('2 client comments · the last by Pat Client');
  });

  it('says so when no client commented this week', () => {
    const html = renderToStaticMarkup(
      createElement(ClientCommentsView, { activity: { rows: [] } }),
    );
    expect(html).toContain('No client has commented in the last 7 days.');
  });
});
