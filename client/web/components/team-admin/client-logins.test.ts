import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientLoginRow } from '@mantle/client-types';
import { clientActionConfirm, clientActionsBlocked } from '../../lib/client-logins';
import { ClientSigninView } from './client-logins';

/**
 * Clients in Settings > Logins (client logins C2), rendered: a client
 * login's Sign-in link card (last sign-in, the open link's expiry, the last
 * link use, disabled), and Issue sign-in link DISABLED, with the note and the
 * way to What clients see, until the report is acknowledged.
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

const view = (r: ClientLoginRow, blocked = false) =>
  renderToStaticMarkup(
    createElement(ClientSigninView, {
      row: r,
      now: NOW,
      blocked,
      onIssue: () => {},
      onRevoke: () => {},
      onShowReport: () => {},
    }),
  );

/** The <button> whose text contains `label`, as markup. */
const button = (html: string, label: string) =>
  html.match(
    new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`),
  )?.[0];

describe("a client login's Sign-in link card (Settings > Logins)", () => {
  it('says whether a link is open, the last sign-in and the last link use', () => {
    const html = view(row());
    expect(html).toMatch(/Last sign-in [^·]+ · Link last used never/);
    expect(html).toContain('Sign-in link open until');
    expect(button(html, 'Revoke link')).toBeDefined();
  });

  it('says when there is no open link, and offers no Revoke', () => {
    const html = view(row({ openLink: null, lastLoginAt: null }));
    expect(html).toContain('No open sign-in link');
    expect(html).toContain('Last sign-in never');
    expect(button(html, 'Revoke link')).toBeUndefined();
  });

  it('an expired link is not open', () => {
    const html = view(
      row({
        openLink: {
          id: 'l',
          createdAt: '2026-09-01T00:00:00.000Z',
          expiresAt: '2026-09-04T00:00:00.000Z',
        },
      }),
    );
    expect(html).toContain('No open sign-in link');
  });

  it('a disabled login issues no link, and says why', () => {
    const html = view(row({ disabled: true }));
    expect(button(html, 'Issue sign-in link')).toBeUndefined();
    expect(html).toContain('This login is disabled');
  });

  it('with the report acknowledged: Issue sign-in link is live, no note', () => {
    const html = view(row());
    expect(button(html, 'Issue sign-in link')).not.toContain('disabled=""');
    expect(html).not.toContain('Check the list in What clients see first');
  });

  it('until then: DISABLED, with the note and a way to What clients see', () => {
    const html = view(row(), true);
    expect(button(html, 'Issue sign-in link')).toContain('disabled=""');
    expect(html).toContain('Check the list in What clients see first');
    expect(button(html, 'What clients see')).toBeDefined();
  });
});

describe('Add client in the Logins list', () => {
  it('waits for What clients see, and says why', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const screen = readFileSync(
      fileURLToPath(new URL('../../app/(app)/settings/users/users-client.tsx', import.meta.url)),
      'utf8',
    );
    expect(screen).toContain('const clientsBlocked = clientActionsBlocked(clientsQuery.data);');
    expect(screen).toMatch(
      /disabled=\{clientsBlocked\}\s*title=\{clientsBlocked \? CLIENT_ACTIONS_BLOCKED_TEXT : undefined\}/,
    );
    expect(clientActionsBlocked(undefined)).toBe(true);
    expect(clientActionsBlocked({ reportAcknowledged: true })).toBe(false);
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

  it('the card confirms a reissue only while a link is open, and the link dialog closes only by Done or Copy', async () => {
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
