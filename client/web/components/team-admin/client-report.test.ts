import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientReport } from '../../lib/contract-next';
import { ClientReportView } from './client-report';

/**
 * Team admin > What clients see (client logins C1), rendered: the intro, the
 * list (kind, updated, old link views, invite hints, the warning for what a
 * client may not read), the empty state, the acknowledgement and the ask
 * again when items went to client after it.
 */
const ACK = {
  ackedAt: '2026-09-28T10:00:00.000Z',
  ackedBy: { id: 'u1', name: 'Ada Admin' },
  itemCount: 2,
};

const report = (over: Partial<ClientReport> = {}): ClientReport => ({
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'page',
      title: 'Project brief',
      updatedAt: '2026-09-20T08:00:00.000Z',
      link: {
        id: 's1',
        createdAt: '2026-06-01T08:00:00.000Z',
        viewCount: 12,
        lastViewedAt: '2026-09-27T08:00:00.000Z',
        expiresAt: null,
      },
      emailedTo: ['pat@example.com', 'lee@example.com'],
      refsAbove: [
        { id: 'r1', type: 'page', title: 'Internal pricing', audience: 'team' },
        { id: 'r2', type: 'note', title: 'Board notes', audience: 'admin' },
      ],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'file',
      title: 'Site plan.pdf',
      updatedAt: '2026-09-21T08:00:00.000Z',
      link: null,
      emailedTo: [],
      refsAbove: [],
    },
  ],
  total: 2,
  acknowledgement: null,
  acknowledged: false,
  newSinceAck: [],
  ...over,
});

const view = (r: ClientReport, acking = false) =>
  renderToStaticMarkup(createElement(ClientReportView, { report: r, acking, onAck: () => {} }));

const ACK_BUTTON = 'I have checked this list';

describe('What clients see', () => {
  it('opens with the intro: check before inviting, every client login reads it all', () => {
    const html = view(report());
    expect(html).toContain('What clients see');
    expect(html).toContain('Before anyone is invited as a client, check this list.');
    expect(html).toContain('Every client login will be able to read all of it.');
  });

  it('lists each client item: title, kind, updated, link views, invite hints', () => {
    const html = view(report());
    expect(html).toContain('Project brief');
    expect(html).toContain('href="/n/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('Page · updated');
    expect(html).toMatch(/Old open link: 12 views, last /);
    expect(html).toContain('Emailed to pat@example.com, lee@example.com.');
    expect(html).toContain('Site plan.pdf');
    expect(html).toContain('File · updated');
  });

  it('warns about what an item names that clients cannot read', () => {
    const html = view(report());
    expect(html).toContain('role="note"');
    expect(html).toContain(
      'clients cannot read: Internal pricing (Team), Board notes (Admin). Clients may see',
    );
    // The item without refs, a link or hints shows none of those rows.
    const plain = view(report({ items: [report().items[1]!], total: 1 }));
    expect(plain).not.toContain('role="note"');
    expect(plain).not.toContain('Old open link');
    expect(plain).not.toContain('Emailed to');
  });

  it('before any check: says so and offers the button', () => {
    const html = view(report());
    expect(html).toContain('Nobody has checked this list yet.');
    expect(html).toContain(ACK_BUTTON);
  });

  it('after the check: who and when, and no button', () => {
    const html = view(report({ acknowledgement: ACK, acknowledged: true }));
    expect(html).toMatch(/Ada Admin checked this list on .+ \(2 items\)\./);
    expect(html).not.toContain(ACK_BUTTON);
    expect(html).not.toContain('went to client since');
  });

  it('asks again, with the count, when items went to client since', () => {
    const r = report({
      acknowledgement: ACK,
      acknowledged: false,
      newSinceAck: ['22222222-2222-4222-8222-222222222222'],
    });
    const html = view(r);
    expect(html).toContain('1 item went to client since then. Check the list again.');
    expect(html).toContain(ACK_BUTTON);
    expect(html).toContain('New since checked');
  });

  it('the button shows it is working while the check is sent', () => {
    const html = view(report(), true);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*I have checked this list/);
  });

  it('empty: says nothing is at client, and the button still acknowledges', () => {
    const html = view(report({ items: [], total: 0 }));
    expect(html).toContain('No item is at client level.');
    expect(html).toContain(ACK_BUTTON);
    expect(html).not.toContain('<ul');
  });

  it('says when the list is cut short', () => {
    expect(view(report({ total: 2500 }))).toContain('Showing 2 of 2500 client items.');
  });

  it('wraps long titles and addresses at phone width', () => {
    const html = view(report());
    expect(html).toContain('break-all');
    expect(html).toContain('flex-wrap');
  });
});

describe('the ack sends what is on the screen', () => {
  const src = readFileSync(fileURLToPath(new URL('./client-report.tsx', import.meta.url)), 'utf8');
  it('the ids of the report it rendered, then refetches', () => {
    expect(src).toContain('const ids = shownIds(report);');
    expect(src).toContain('await acknowledgeClientReport(ids);');
    expect(src).toContain('void queryClient.invalidateQueries({ queryKey: CLIENT_REPORT_KEY });');
  });

  it('is a Team admin tab, fed by the tab query', () => {
    const page = readFileSync(
      fileURLToPath(new URL('../../app/(app)/team-admin/page.tsx', import.meta.url)),
      'utf8',
    );
    expect(page).toContain(
      "tab('What clients see', '/team-admin?view=clients', active === 'clients')",
    );
    expect(page).toContain("if (view === 'clients') return <ClientsTab />;");
    expect(page).toMatch(/<TabPending active="clients" query=\{q\}/);
    expect(page).toContain('<ClientReportPanel report={q.data} />');
  });
});
