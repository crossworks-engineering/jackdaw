import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientSigninClient } from './client-signin-client';

/**
 * /client-signin (client logins C2), rendered as the server sends it: one
 * complete state or the other, never part of each. With the link's code:
 * the email check and Sign in. Without: how a client gets in, and staff
 * sign-in, with no form at all. No app chrome in either.
 */
const MARK = createElement('p', null, 'BRAND-MARK');
const render = (initialCode: string) =>
  renderToStaticMarkup(createElement(ClientSigninClient, { mark: MARK, initialCode }));

const FORM_PARTS = ['<form', 'id="client-email"', 'type="email"', 'Sign in</'];
const NO_CODE_PARTS = ['Open the sign-in link you were sent.', 'Staff sign in'];

describe('ClientSigninClient', () => {
  it('with a code: the whole form (email and Sign in), and nothing of the no-code state', () => {
    const html = render('AbCd1234efGH');
    for (const part of FORM_PARTS) expect(html, part).toContain(part);
    for (const part of NO_CODE_PARTS) expect(html, part).not.toContain(part);
    expect(html).toContain('Enter your email to sign in.');
    expect(html).toContain('BRAND-MARK');
    // The email is typed, never filled in: it is a check.
    expect(html).not.toMatch(/id="client-email"[^>]*value="[^"]+"/);
  });

  it('without a code: the way in, and no form, no field, no Sign in', () => {
    for (const code of ['', '   ']) {
      const html = render(code);
      for (const part of NO_CODE_PARTS) expect(html, part).toContain(part);
      for (const part of FORM_PARTS) expect(html, part).not.toContain(part);
      expect(html).not.toContain('<input');
      expect(html).toContain('BRAND-MARK');
    }
  });

  it('never carries the app chrome', () => {
    for (const code of ['', 'AbCd1234efGH']) {
      const html = render(code);
      expect(html).not.toContain('<nav');
      expect(html).not.toContain('aria-label="Primary"');
    }
  });
});
