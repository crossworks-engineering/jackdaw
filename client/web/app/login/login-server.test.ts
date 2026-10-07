import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginServer, brainHostLabel } from './login-server';

/** "Signing in to <brain>": which brain the password is about to go to. */
describe('brainHostLabel', () => {
  it('the host, with a port only when it is not the default', () => {
    expect(brainHostLabel('https://brain.example')).toBe('brain.example');
    expect(brainHostLabel('https://brain.example:443')).toBe('brain.example');
    expect(brainHostLabel('http://127.0.0.1:8080')).toBe('127.0.0.1:8080');
  });

  it('nothing for nothing usable', () => {
    expect(brainHostLabel(undefined)).toBe('');
    expect(brainHostLabel('')).toBe('');
    expect(brainHostLabel('not a url')).toBe('');
  });
});

describe('LoginServer', () => {
  it('renders the brain on the first paint, from the server render', () => {
    const html = renderToStaticMarkup(
      createElement(LoginServer, { origin: 'https://second.example' }),
    );
    expect(html).toContain('Signing in to');
    expect(html).toContain('second.example');
  });

  it('renders nothing when the server render knows no brain', () => {
    expect(renderToStaticMarkup(createElement(LoginServer, {}))).toBe('');
  });
});
