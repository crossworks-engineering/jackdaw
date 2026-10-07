import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_BRAIN_HEADER,
  DESKTOP_BRAIN_KEY_HEADER,
  brainRequestFilter,
  brainWindowRequestFilter,
  rewriteBrainWindowRequest,
  stripBrowserOnlyHeaders,
} from './brain-fence';

describe('stripBrowserOnlyHeaders', () => {
  it('drops Origin and every Sec-Fetch-* header, whatever the case', () => {
    const out = stripBrowserOnlyHeaders({
      Origin: 'http://127.0.0.1:51234',
      'Sec-Fetch-Site': 'cross-site',
      'sec-fetch-mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'SEC-FETCH-USER': '?1',
    });
    expect(out).toEqual({});
  });

  it('keeps everything else, the bearer and the body type included', () => {
    const out = stripBrowserOnlyHeaders({
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
      'Sec-CH-UA': '"Chromium"',
      'Idempotency-Key': 'k',
    });
    expect(out).toEqual({
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
      'Sec-CH-UA': '"Chromium"',
      'Idempotency-Key': 'k',
    });
  });
});

/**
 * The desktop client login stands on this fence (lib/client-device-signin.ts
 * in the web app). The brain's device sign-in refuses a web page: its
 * `refuseBrowserDeviceMode` (mantle server/web/lib/client-logins.ts) answers
 * 403 `device-only` to any request with `Origin`, `Sec-Fetch-Site`,
 * `Sec-Fetch-Mode` or `Sec-Fetch-Dest`. Those are what Chromium puts on the
 * renderer's fetch to the brain, and only the fence takes them off. These
 * tests pin each link of that chain, so a later change to the fence cannot
 * quietly cost the desktop its client logins.
 */
describe('the fence and the client device sign-in', () => {
  const BRAIN = 'https://brain.example';

  /** The brain's own test, mirrored: true is a 403 `device-only`. */
  const brainRefusesAsBrowser = (headers: Record<string, string>) => {
    const has = (name: string) => Object.keys(headers).some((k) => k.toLowerCase() === name);
    return has('origin') || has('sec-fetch-site') || has('sec-fetch-mode') || has('sec-fetch-dest');
  };

  /** Electron's URL filter is a Chrome match pattern; `*` is any run. */
  const matches = (pattern: string, url: string) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(url);

  /** What Chromium sends for the renderer's JSON POST from the loopback UI. */
  const chromiumPost = () => ({
    Origin: 'http://127.0.0.1:51234',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Content-Type': 'application/json',
    Accept: '*/*',
  });

  it('the filter covers both device sign-in routes, and nothing off the brain', () => {
    const [pattern] = brainRequestFilter(BRAIN).urls;
    expect(brainRequestFilter(BRAIN).urls).toHaveLength(1);
    for (const path of ['/api/auth/client-code', '/api/auth/client-code/verify']) {
      expect(matches(pattern!, `${BRAIN}${path}`), path).toBe(true);
    }
    expect(matches(pattern!, 'https://brain.example.evil/api/auth/client-code')).toBe(false);
    expect(matches(pattern!, 'https://other.example/api/auth/client-code')).toBe(false);
  });

  it('unfenced, the brain refuses the request; fenced, it passes as a native client', () => {
    expect(brainRefusesAsBrowser(chromiumPost())).toBe(true);
    const fenced = stripBrowserOnlyHeaders(chromiumPost());
    expect(brainRefusesAsBrowser(fenced)).toBe(false);
    // And the auth routes' cross-site guard, which reads Sec-Fetch-Site when
    // there is no Origin, finds nothing to refuse; the body stays JSON.
    expect(fenced['Content-Type']).toBe('application/json');
    expect(Object.keys(fenced).map((k) => k.toLowerCase())).not.toContain('sec-fetch-site');
  });

  it('index.ts applies the fence to every brain window, before the window exists', () => {
    const src = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
    expect(src).toContain('const brainUrls = brainRequestFilter(brainOrigin);');
    // ONE onBeforeSendHeaders listener, over the brain and the embedded UI
    // server both: a second registration would replace the first.
    expect(src.match(/onBeforeSendHeaders\(/g)).toHaveLength(1);
    expect(src).toMatch(
      /ses\.webRequest\.onBeforeSendHeaders\(\s*brainWindowRequestFilter\(brainOrigin, rendererOrigin\),\s*\(\{ url, requestHeaders \}, callback\) => \{\s*callback\(\{\s*requestHeaders: rewriteBrainWindowRequest\(url, requestHeaders, origins, RENDERER_BRAIN_KEY\),/,
    );
    // No redirect of /env.js to a data: URL: Chromium refuses it.
    expect(src).not.toContain('redirectURL');
    // openAppWindow fences the window's own partition first.
    const open = src.slice(src.indexOf('async function openAppWindow('));
    const fence = open.indexOf(
      'fenceBrainSession(session.fromPartition(partition), profile.origin, rendererOrigin);',
    );
    expect(fence).toBeGreaterThan(-1);
    expect(fence).toBeLessThan(open.indexOf('new BrowserWindow('));
    expect(open.slice(0, open.indexOf('preload:'))).toMatch(/webPreferences: \{\s*partition,/);
  });
});

/**
 * One embedded UI server renders every brain's window. A second brain's window
 * was rendered for the first, CSP included, and could not reach its own brain,
 * until the shell named the window's brain on each request to that server.
 */
describe('brain window requests', () => {
  const renderer = 'http://127.0.0.1:53077';
  const key = 'k'.repeat(64);

  it('every window names ITS brain to the embedded server, with the key', () => {
    for (const brain of ['https://second.example', 'https://third.example']) {
      const out = rewriteBrainWindowRequest(
        `${renderer}/login?add=1`,
        { Accept: 'text/html' },
        { brain, renderer },
        key,
      );
      expect(out).toEqual({
        Accept: 'text/html',
        [DESKTOP_BRAIN_HEADER]: brain,
        [DESKTOP_BRAIN_KEY_HEADER]: key,
      });
    }
  });

  it('a brain the page names itself is replaced, whatever its case', () => {
    const out = rewriteBrainWindowRequest(
      `${renderer}/login`,
      { 'x-jackdaw-brain': 'https://evil.example', 'X-JACKDAW-BRAIN-KEY': 'guess' },
      { brain: 'https://second.example', renderer },
      key,
    );
    expect(out).toEqual({
      [DESKTOP_BRAIN_HEADER]: 'https://second.example',
      [DESKTOP_BRAIN_KEY_HEADER]: key,
    });
  });

  it('requests to the brain are made native, and never carry the key', () => {
    const brain = 'https://second.example';
    const out = rewriteBrainWindowRequest(
      `${brain}/api/auth/token`,
      { Origin: renderer, 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
      { brain, renderer },
      key,
    );
    expect(out).toEqual({ 'Content-Type': 'application/json' });
  });

  it('anything else passes untouched: the key goes nowhere but the server', () => {
    const out = rewriteBrainWindowRequest(
      'http://127.0.0.1:53078/env.js',
      { Accept: '*/*' },
      { brain: 'https://second.example', renderer },
      key,
    );
    expect(out).toEqual({ Accept: '*/*' });
  });

  it('one filter covers both, because a session keeps ONE such listener', () => {
    expect(brainWindowRequestFilter('https://second.example', renderer)).toEqual({
      urls: ['https://second.example/*', `${renderer}/*`],
    });
  });
});
