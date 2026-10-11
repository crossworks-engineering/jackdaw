import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LOADING_SIGN_OUT_AFTER_MS, ShellGate, ShellLoadingScreen } from './shell-screens';
import type { ShellProbeFailure } from '../../lib/shell-probe';

/**
 * The shell's gate (phase W5c): one shell for every login, rendered once
 * GET /api/shell has answered, a neutral full-window screen until then.
 */
const SHELL = createElement('p', null, 'THE-SHELL');

const gate = (ready: boolean, failure: ShellProbeFailure | null = null) =>
  renderToStaticMarkup(
    createElement(ShellGate, { ready, failure, onRetry: () => {}, children: SHELL }),
  );

describe('ShellGate', () => {
  it('renders the shell once the probe answered, whatever failed before', () => {
    expect(gate(true)).toBe('<p>THE-SHELL</p>');
    expect(gate(true, 'error')).toBe('<p>THE-SHELL</p>');
  });

  it('renders a full-window loading screen until then, without Sign out at first', () => {
    const html = gate(false);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading');
    expect(html).toContain('min-h-dvh');
    expect(html).not.toContain('THE-SHELL');
    expect(html).not.toContain('Sign out');
  });

  it('the loading screen offers Sign out once its wait is over', () => {
    expect(LOADING_SIGN_OUT_AFTER_MS).toBeGreaterThan(0);
    expect(LOADING_SIGN_OUT_AFTER_MS).toBeLessThanOrEqual(5_000);
    const late = renderToStaticMarkup(createElement(ShellLoadingScreen, { signOutAfterMs: 0 }));
    expect(late).toContain('Sign out');
    expect(late).toContain('Loading');
  });

  it('offers Try again and Sign out when the probe failed, as an alert', () => {
    const html = gate(false, 'error');
    expect(html).toContain('Could not load your workspace');
    expect(html).toContain('Try again');
    expect(html).toContain('Sign out');
    expect(html).toContain('Reconnecting');
    expect(html).toMatch(/<section role="alert" tabindex="-1"/);
    expect(html).not.toContain('THE-SHELL');
  });

  it('says what failed, and never "the brain did not answer" for an answer', () => {
    expect(gate(false, 'offline')).toContain('This device is offline.');
    expect(gate(false, 'unreachable')).toContain('The brain could not be reached.');
    const html = gate(false, 'error');
    expect(html).toContain('Something went wrong while loading it.');
    expect(html).not.toMatch(/did not answer|could not be reached|offline/i);
  });
});
