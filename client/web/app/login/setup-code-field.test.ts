import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SetupCodeField, isSetupCodeRefusal } from './setup-code-field';

/**
 * The first-run signup's setup-code field (headless onboarding): a labelled,
 * required input with the "how to see it again" hint, and the brain's
 * setup-code 403 shown on the field itself.
 */
describe('SetupCodeField', () => {
  const render = (error?: string) =>
    renderToStaticMarkup(createElement(SetupCodeField, { value: '', onChange: () => {}, error }));

  it('is a required, labelled input with the reprint hint', () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*for="setup-code"[^>]*>Setup code<\/label>/);
    expect(html).toMatch(/<input[^>]*id="setup-code"[^>]*required/);
    expect(html).toContain('scripts/install.sh --setup-code');
    expect(html).toContain('aria-describedby="setup-code-hint"');
    expect(html).not.toContain('aria-invalid');
  });

  it('shows the error on the field and points the input at it', () => {
    const html = render('That setup code is not right.');
    expect(html).toContain('That setup code is not right.');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="setup-code-error setup-code-hint"');
  });
});

describe('isSetupCodeRefusal', () => {
  it('only the 403 with reason setup-code', () => {
    expect(isSetupCodeRefusal(403, { reason: 'setup-code' })).toBe(true);
    expect(isSetupCodeRefusal(403, {})).toBe(false);
    expect(isSetupCodeRefusal(403, { reason: 'cross-site' })).toBe(false);
    expect(isSetupCodeRefusal(400, { reason: 'setup-code' })).toBe(false);
  });
});
