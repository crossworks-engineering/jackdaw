import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientSigninClient, clientSigninMode } from './client-signin-client';

/**
 * /client-signin (client logins C2, C2b), rendered as the server sends it:
 * one complete state, never part of another. With the link's code: the
 * email check and Sign in (and, when this brain mails codes, the way to a
 * code instead). Without a code: sign-in by an emailed code when the brain
 * sends codes, else how a client gets in, with no form at all. Staff
 * sign-in whenever there is no link. No app chrome in any.
 */
const MARK = createElement('p', null, 'BRAND-MARK');
const render = (initialCode: string, codesEnabled = false, initialSplit = false) =>
  renderToStaticMarkup(
    createElement(ClientSigninClient, { mark: MARK, initialCode, codesEnabled, initialSplit }),
  );

const FORM_PARTS = ['<form', 'id="client-email"', 'type="email"', 'Sign in</'];
const NO_CODE_PARTS = [
  'Open the sign-in link you were sent.',
  'ask the team for a new one',
  'Staff sign in',
];
const CODE_PARTS = ['id="client-code-email"', 'Email me a code', 'Staff sign in'];
const CODE_INSTEAD = 'Sign in with an email code instead';

describe('clientSigninMode', () => {
  it('the link first, then a code when the brain sends codes, else neither', () => {
    expect(clientSigninMode('AbCd1234efGH', true)).toBe('link');
    expect(clientSigninMode('AbCd1234efGH', false)).toBe('link');
    expect(clientSigninMode('', true)).toBe('code');
    expect(clientSigninMode('', false)).toBe('none');
  });
});

describe('ClientSigninClient', () => {
  it('with a code: the whole form (email and Sign in), and nothing of the other states', () => {
    const html = render('AbCd1234efGH');
    for (const part of FORM_PARTS) expect(html, part).toContain(part);
    for (const part of [...NO_CODE_PARTS, ...CODE_PARTS]) expect(html, part).not.toContain(part);
    expect(html).toContain('Enter your email to sign in.');
    expect(html).toContain('BRAND-MARK');
    // The email is typed, never filled in: it is a check.
    expect(html).not.toMatch(/id="client-email"[^>]*value="[^"]+"/);
    // Codes off: no way to one.
    expect(html).not.toContain(CODE_INSTEAD);
  });

  it('with a code and codes on: the link form, and a way to a code instead', () => {
    const html = render('AbCd1234efGH', true);
    for (const part of FORM_PARTS) expect(html, part).toContain(part);
    expect(html).toContain(CODE_INSTEAD);
    // The code form waits for that choice.
    expect(html).not.toContain('id="client-code-email"');
  });

  it('without a code, codes off: the way in (ask for a link), and no form, no field', () => {
    for (const code of ['', '   ']) {
      const html = render(code);
      for (const part of NO_CODE_PARTS) expect(html, part).toContain(part);
      for (const part of FORM_PARTS) expect(html, part).not.toContain(part);
      expect(html).not.toContain('<input');
      expect(html).not.toContain('Email me a code');
      expect(html).toContain('BRAND-MARK');
    }
  });

  it('without a code, codes on: the email step of a code, and staff sign-in', () => {
    const html = render('', true);
    for (const part of CODE_PARTS) expect(html, part).toContain(part);
    expect(html).toContain('Sign in with a code sent to your email.');
    // Not the link's form, and not the code field yet.
    expect(html).not.toContain('id="client-email"');
    expect(html).not.toContain('id="client-code"');
    expect(html).not.toContain('Open the sign-in link you were sent.');
  });

  it('never carries the app chrome', () => {
    for (const [code, on] of [
      ['', false],
      ['', true],
      ['AbCd1234efGH', false],
      ['AbCd1234efGH', true],
    ] as const) {
      const html = render(code, on);
      expect(html).not.toContain('<nav');
      expect(html).not.toContain('aria-label="Primary"');
    }
  });

  it('split origin (the API elsewhere): no form, no field, one plain line (B27)', () => {
    for (const [code, on] of [
      ['', false],
      ['', true],
      ['AbCd1234efGH', false],
      ['AbCd1234efGH', true],
    ] as const) {
      const html = render(code, on, true);
      expect(html).toContain('Client sign-in is not available on this address.');
      expect(html).not.toContain('<form');
      expect(html).not.toContain('<input');
      expect(html).not.toContain(CODE_INSTEAD);
      expect(html).toContain('Staff sign in');
      expect(html).toContain('BRAND-MARK');
    }
  });

  it('the no-link states wait while the inline script holds a fragment code (B12)', () => {
    // A #code= link: the server renders the no-link state, which stays
    // hidden (globals.css) until the page reads the code.
    expect(render('')).toContain('data-link-code-wait=""');
    expect(render('', true)).toContain('data-link-code-wait=""');
    // The link's own form never waits.
    expect(render('AbCd1234efGH')).not.toContain('data-link-code-wait');
  });
});
