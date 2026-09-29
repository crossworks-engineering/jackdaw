import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientSigninSender } from '@mantle/client-types';
import { ClientSigninSenderView } from './client-signin-sender';

/**
 * Team admin > Clients > Sign-in codes by email (client logins C2b),
 * rendered: the sender picked (or None), the sent-mail folders kept out of
 * the brain, the count against the daily cap, and the cap banner ONLY while
 * the cap is reached.
 */
const DESK = { id: '11111111-1111-4111-8111-111111111111', address: 'desk@example.invalid' };
const OTHER = { id: '22222222-2222-4222-8222-222222222222', address: 'info@example.invalid' };

const data = (over: Partial<ClientSigninSender> = {}): ClientSigninSender => ({
  sender: DESK,
  candidates: [DESK, OTHER],
  sentFoldersExcluded: ['Sent', 'Sent Items'],
  dailyCap: 200,
  sentLast24h: 3,
  capReached: false,
  ...over,
});

const view = (d: ClientSigninSender, error?: string) =>
  renderToStaticMarkup(
    createElement(ClientSigninSenderView, { data: d, error, onChange: () => {} }),
  );

const CAP = 'The daily limit of 200 sign-in codes is reached.';

describe('Sign-in codes by email', () => {
  it('a sender: its address, the folders kept out, the count, no banner', () => {
    const html = view(data());
    expect(html).toContain('Sign-in codes by email');
    expect(html).toMatch(/id="client-codes-sender"[^>]*>.*desk@example\.invalid/);
    expect(html).toContain(
      'Sent mail from this account is kept out of the brain: Sent, Sent Items.',
    );
    expect(html).toContain('3 of 200 codes sent in the last 24 hours.');
    expect(html).not.toContain(CAP);
    expect(html).not.toContain('data-testid="client-codes-cap"');
  });

  it('the banner while the cap is reached, and only then', () => {
    const html = view(data({ sentLast24h: 201, capReached: true }));
    expect(html).toContain(CAP);
    expect(html).toContain(
      'Requests are still accepted, but no code is sent until the window moves on.',
    );
    expect(html).toMatch(/<p role="status"[^>]*data-testid="client-codes-cap"/);
    // A high count alone is not the banner: the brain says when.
    expect(view(data({ sentLast24h: 199, capReached: false }))).not.toContain(CAP);
    expect(view(data({ sender: null, capReached: false }))).not.toContain(CAP);
  });

  it('None: codes are off, and no folders are named', () => {
    const html = view(data({ sender: null, sentFoldersExcluded: [] }));
    expect(html).toMatch(/id="client-codes-sender"[^>]*>.*None \(codes off\)/);
    expect(html).toContain('Codes are off.');
    expect(html).not.toContain('kept out of the brain:');
  });

  it('no account can send: says where to add one', () => {
    const html = view(data({ sender: null, candidates: [], sentFoldersExcluded: [] }));
    expect(html).toMatch(/<a[^>]*href="\/settings\/accounts"[^>]*>Email accounts<\/a>/);
  });

  it('a refusal sits on the picker', () => {
    const html = view(data(), 'That email account is not in this brain any more. Pick another.');
    expect(html).toMatch(
      /id="client-codes-sender-error"[^>]*>That email account is not in this brain any more\./,
    );
    const trigger = html.match(/<button[^>]*id="client-codes-sender"[^>]*>/)?.[0] ?? '';
    expect(trigger).toContain('aria-invalid="true"');
  });
});

describe('what the brain did with codes (audit B3)', () => {
  it('delivered, failed and skipped, and the last failure', () => {
    const html = view(
      data({
        deliveredLast24h: 4,
        failedLast24h: 1,
        capSkipsLast24h: 2,
        lastFailure: { at: '2026-09-29T08:00:00.000Z', reason: '535 Authentication failed' },
        emailWorker: true,
      }),
    );
    expect(html).toContain(
      '4 of 200 codes delivered in the last 24 hours, 1 send failed, 2 requests skipped at a limit.',
    );
    expect(html).toMatch(
      /data-testid="client-codes-last-failure"[^>]*>Last failed send [^<]+: 535 Authentication failed/,
    );
    expect(html).not.toContain('data-testid="client-codes-worker-off"');
  });

  it('no failure: no failure line', () => {
    expect(view(data({ deliveredLast24h: 3, lastFailure: null }))).not.toContain(
      'client-codes-last-failure',
    );
  });

  it('no email worker on this box: the banner says codes are off', () => {
    const html = view(data({ emailWorker: false }));
    expect(html).toMatch(
      /<p role="status"[^>]*data-testid="client-codes-worker-off"[^>]*>.*The email worker is not running on this box: codes are off\./,
    );
    expect(html).toContain('Codes are off on this box (no email worker)');
    // A brain that does not say: no banner.
    expect(view(data())).not.toContain('client-codes-worker-off');
  });
});
