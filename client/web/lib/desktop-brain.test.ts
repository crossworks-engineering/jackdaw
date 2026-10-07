import { describe, expect, it } from 'vitest';
import { resolveBrainOrigin } from './desktop-brain';

/**
 * The desktop shell runs one embedded server for every brain. A second brain's
 * window was rendered for the first (its branding, and a CSP that refused
 * every request to its own brain) until the shell named the window's brain on
 * each request. These pin who may name it.
 */
const env = { serverOrigin: 'https://first.example/', desktopKey: 'k'.repeat(64) };

describe('resolveBrainOrigin', () => {
  it('a web deployment: the configured origin, trailing slash dropped', () => {
    expect(resolveBrainOrigin({ serverOrigin: 'https://brain.example/' }, {})).toBe(
      'https://brain.example',
    );
  });

  it('the shell, with its key: the window brain, second and third alike', () => {
    for (const brain of ['https://second.example', 'https://third.example:8443']) {
      expect(resolveBrainOrigin(env, { brain, key: env.desktopKey })).toBe(brain);
    }
  });

  it('a header without the key, or with the wrong one, is ignored', () => {
    const brain = 'https://elsewhere.example';
    expect(resolveBrainOrigin(env, { brain })).toBe('https://first.example');
    expect(resolveBrainOrigin(env, { brain, key: 'nope' })).toBe('https://first.example');
    expect(resolveBrainOrigin(env, { brain, key: 'k'.repeat(63) + 'j' })).toBe(
      'https://first.example',
    );
  });

  it('no key in the environment (every web deployment): the header means nothing', () => {
    const web = { serverOrigin: 'https://brain.example' };
    expect(resolveBrainOrigin(web, { brain: 'https://other.example', key: '' })).toBe(
      'https://brain.example',
    );
    expect(resolveBrainOrigin(web, { brain: 'https://other.example', key: 'x' })).toBe(
      'https://brain.example',
    );
  });

  it('only an http(s) origin is taken, reduced to its origin', () => {
    const key = env.desktopKey;
    expect(resolveBrainOrigin(env, { brain: 'https://b.example/path?q=1', key })).toBe(
      'https://b.example',
    );
    for (const brain of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', '']) {
      expect(resolveBrainOrigin(env, { brain, key })).toBe('https://first.example');
    }
  });
});
