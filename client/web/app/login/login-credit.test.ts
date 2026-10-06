import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginCredit } from './login-credit';

/**
 * The sign-in footer: Mantle always; Jackdaw beside it, on its left, only
 * when the owner's branding holds the hero (or the bird shows twice).
 */
describe('LoginCredit', () => {
  it('unbranded brain: the Mantle mark alone', () => {
    const html = renderToStaticMarkup(createElement(LoginCredit, { showJackdaw: false }));
    expect(html).toContain('src="/brand/mantle-row.svg"');
    expect(html).not.toContain('jackdaw-row');
  });

  it('branded brain: Jackdaw first, Mantle to its right', () => {
    const html = renderToStaticMarkup(createElement(LoginCredit, { showJackdaw: true }));
    const jackdaw = html.indexOf('/brand/jackdaw-row-light.png');
    const mantle = html.indexOf('/brand/mantle-row.svg');
    expect(jackdaw).toBeGreaterThan(-1);
    expect(mantle).toBeGreaterThan(jackdaw);
  });
});
