import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientLoginList, ClientLoginRow } from '@mantle/client-types';
import { clientActionConfirm } from '../../lib/client-logins';
import { ClientLoginsView } from './client-logins';

/**
 * Team admin > Clients (client logins C2), rendered: the list (email, name,
 * last sign-in, the open link's expiry, the last link use, disabled), and
 * Add client and Issue sign-in link DISABLED, with the note and the link to
 * What clients see, until the report is acknowledged.
 */
const NOW = Date.parse('2026-09-29T10:00:00.000Z');

const row = (over: Partial<ClientLoginRow> = {}): ClientLoginRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'pat@example.invalid',
  displayName: 'Pat Client',
  contactId: null,
  disabled: false,
  createdAt: '2026-09-20T08:00:00.000Z',
  lastLoginAt: '2026-09-28T08:00:00.000Z',
  openLink: {
    id: 'l1',
    createdAt: '2026-09-28T09:00:00.000Z',
    expiresAt: '2026-10-01T09:00:00.000Z',
  },
  lastLinkUsedAt: null,
  ...over,
});

const view = (list: ClientLoginList) =>
  renderToStaticMarkup(
    createElement(ClientLoginsView, {
      list,
      now: NOW,
      onAdd: () => {},
      onIssue: () => {},
      onAction: () => {},
      onEnable: () => {},
    }),
  );

/** The <button> whose text contains `label`, as markup. */
const button = (html: string, label: string) =>
  html.match(
    new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`),
  )?.[0];

describe('Clients', () => {
  it('lists each login: name, email, last sign-in, open link, last link use', () => {
    const html = view({ clients: [row()], reportAcknowledged: true });
    expect(html).toContain('Pat Client');
    expect(html).toContain('pat@example.invalid');
    expect(html).toMatch(/Last sign-in [^·]+ · Link last used never/);
    expect(html).toContain('Sign-in link open until');
  });

  it('says when there is no open link, and marks a disabled login (with Enable)', () => {
    const html = view({
      clients: [row({ openLink: null, disabled: true, lastLoginAt: null })],
      reportAcknowledged: true,
    });
    expect(html).toContain('No open sign-in link');
    expect(html).toContain('Last sign-in never');
    expect(html).toContain('Disabled');
    expect(button(html, 'Enable')).toBeDefined();
    expect(button(html, 'Issue sign-in link')).toBeUndefined();
  });

  it('an expired link is not open', () => {
    const html = view({
      clients: [
        row({
          openLink: {
            id: 'l',
            createdAt: '2026-09-01T00:00:00.000Z',
            expiresAt: '2026-09-04T00:00:00.000Z',
          },
        }),
      ],
      reportAcknowledged: true,
    });
    expect(html).toContain('No open sign-in link');
  });

  it('with the report acknowledged: Add client and Issue sign-in link are live, no note', () => {
    const html = view({ clients: [row()], reportAcknowledged: true });
    expect(button(html, 'Add client')).not.toContain('disabled=""');
    expect(button(html, 'Issue sign-in link')).not.toContain('disabled=""');
    expect(html).not.toContain('Check the list in What clients see first');
  });

  it('until then: both DISABLED, with the note and a link to What clients see', () => {
    const html = view({ clients: [row()], reportAcknowledged: false });
    expect(button(html, 'Add client')).toContain('disabled=""');
    expect(button(html, 'Issue sign-in link')).toContain('disabled=""');
    expect(html).toContain('Check the list in What clients see first');
    expect(html).toMatch(/<a[^>]*href="\/team-admin\?view=clients"[^>]*>What clients see<\/a>/);
  });

  it('empty: says so, and Add client still waits for the report', () => {
    expect(view({ clients: [], reportAcknowledged: true })).toContain('No client logins yet.');
    expect(button(view({ clients: [], reportAcknowledged: false }), 'Add client')).toContain(
      'disabled=""',
    );
  });
});

describe('the confirms (client logins audit B14, B27)', () => {
  it('End sessions ends sessions and revokes the open link, and points to Disable', () => {
    const c = clientActionConfirm('end', row());
    expect(c.title).toBe('End every session of Pat Client?');
    expect(c.body).toContain('signed out on every device at once');
    expect(c.body).toContain('any open sign-in link is revoked');
    expect(c.body).toContain('To keep them out, disable the login instead.');
    // It no longer promises they need a new link: a code may still let them in.
    expect(c.body).not.toContain('need a new sign-in link');
  });

  it('Issue sign-in link over an open one: says the open link stops working', () => {
    const c = clientActionConfirm('reissue', row(), '1 Oct 2026, 09:00');
    expect(c.title).toBe('Issue a new sign-in link for Pat Client?');
    expect(c.body).toMatch(/^Their open link \(open until 1 Oct 2026, 09:00\) stops working now/);
    expect(c.action).toBe('Issue new link');
  });

  it('the panel confirms a reissue only while a link is open, and the link dialog closes only by Done or Copy', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const panel = readFileSync(
      fileURLToPath(new URL('./client-logins.tsx', import.meta.url)),
      'utf8',
    );
    expect(panel).toMatch(
      /if \(openLinkAt\(row, Date\.now\(\)\)\) setAction\(\{ kind: 'reissue', row \}\);\s*else void issue\(row\);/,
    );
    expect(panel).toContain('onIssue={askIssue}');
    const dialog = panel.slice(panel.indexOf('function SigninLinkDialog('));
    expect(dialog).toMatch(/<Dialog open=\{!!issued\}>/);
    expect(dialog).toContain('hideClose');
    expect(dialog).toContain('onEscapeKeyDown={(e) => e.preventDefault()}');
    expect(dialog).toContain('onInteractOutside={(e) => e.preventDefault()}');
  });
});
