import { describe, expect, it } from 'vitest';
import { chatImageAllowed, chatLinkAction, isSafeChatHref } from './chat-links';

const ORIGIN = 'https://brain.example.test';

describe('what a chat reply may link to', () => {
  it('http(s), mailto and relative links', () => {
    for (const href of [
      'https://example.test/a',
      'http://example.test',
      'mailto:someone@example.test',
      '/n/abc',
      'n/abc',
      '#top',
      '?q=1',
      'HTTPS://EXAMPLE.TEST',
    ]) {
      expect(isSafeChatHref(href)).toBe(true);
    }
  });

  it('no other scheme, however it is spelled', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      'file:///etc/passwd',
      'media:f-1',
      'page:p-1',
      '',
      null,
      undefined,
    ]) {
      expect(isSafeChatHref(href)).toBe(false);
    }
  });

  it('a click: this origin routes, another opens a tab, mailto is the browser’s', () => {
    expect(chatLinkAction('/n/abc?x=1#h', ORIGIN)).toEqual({ kind: 'route', path: '/n/abc?x=1#h' });
    expect(chatLinkAction(`${ORIGIN}/pages/1`, ORIGIN)).toEqual({
      kind: 'route',
      path: '/pages/1',
    });
    expect(chatLinkAction('https://other.example.test/a', ORIGIN)).toEqual({
      kind: 'open',
      href: 'https://other.example.test/a',
    });
    expect(chatLinkAction('//other.example.test/a', ORIGIN)).toEqual({
      kind: 'open',
      href: 'https://other.example.test/a',
    });
    expect(chatLinkAction('mailto:a@example.test', ORIGIN)).toEqual({ kind: 'default' });
  });

  it('a click on any other scheme does nothing', () => {
    expect(chatLinkAction('javascript:alert(1)', ORIGIN)).toEqual({ kind: 'block' });
    expect(chatLinkAction('data:text/html,x', ORIGIN)).toEqual({ kind: 'block' });
    expect(chatLinkAction('media:f-1', ORIGIN)).toEqual({ kind: 'block' });
  });
});

describe('which pictures of a reply show', () => {
  it('an Admin user: any picture', () => {
    expect(chatImageAllowed('https://cdn.example.test/a.png', true)).toBe(true);
    expect(chatImageAllowed('/api/files/files/f-1?raw=1', true)).toBe(true);
    expect(chatImageAllowed('data:image/png;base64,AAAA', true)).toBe(true);
  });

  it('anyone else: same-origin pictures off the owner byte routes only', () => {
    expect(chatImageAllowed('/brand/logo.png', false)).toBe(true);
    expect(chatImageAllowed('https://cdn.example.test/a.png', false)).toBe(false);
    expect(chatImageAllowed('http://cdn.example.test/a.png', false)).toBe(false);
    expect(chatImageAllowed('//cdn.example.test/a.png', false)).toBe(false);
    expect(chatImageAllowed('/\\cdn.example.test/a.png', false)).toBe(false);
    expect(chatImageAllowed('data:image/png;base64,AAAA', false)).toBe(false);
    // The owner byte routes answer a member 401.
    expect(chatImageAllowed('/api/files/files/f-1?raw=1', false)).toBe(false);
    expect(chatImageAllowed('/api/draws/d-1/svg?raw=1', false)).toBe(false);
    expect(chatImageAllowed('/somewhere/x?raw', false)).toBe(false);
    expect(chatImageAllowed('', false)).toBe(false);
  });
});
