import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientCodeLink } from './client-code-link';

/**
 * /login's line for a client (client logins C2b): there when this brain
 * mails sign-in codes, pointing at /client-signin; nothing at all when not.
 */
describe('ClientCodeLink', () => {
  it('with codes on: one quiet link to the client sign-in', () => {
    const html = renderToStaticMarkup(createElement(ClientCodeLink, { enabled: true }));
    expect(html).toMatch(/<a[^>]*href="\/client-signin"[^>]*>Sign in with an email code<\/a>/);
    expect(html).toContain('Client?');
  });

  it('with codes off: nothing', () => {
    expect(renderToStaticMarkup(createElement(ClientCodeLink, { enabled: false }))).toBe('');
  });
});
