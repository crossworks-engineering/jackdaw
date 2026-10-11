import { describe, expect, it } from 'vitest';
import {
  chatImageAllowed,
  chatLinkAction,
  decodeHtmlEntities,
  isSafeChatHref,
  sanitizeChatDoc,
  type ChatDocNode,
} from './chat-links';

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

describe('entities and escapes cannot hide a URL (W7f fix round 2)', () => {
  it('decodes numeric and named references the way an attribute does', () => {
    expect(decodeHtmlEntities('&#104;ttps://x')).toBe('https://x');
    expect(decodeHtmlEntities('&#x68;ttps://x')).toBe('https://x');
    expect(decodeHtmlEntities('&#106avascript:x')).toBe('javascript:x');
    expect(decodeHtmlEntities('&#47;&#47;evil.example.test')).toBe('//evil.example.test');
    expect(decodeHtmlEntities('javascript&colon;x')).toBe('javascript:x');
    expect(decodeHtmlEntities('&sol;&sol;host')).toBe('//host');
    expect(decodeHtmlEntities('&amp;#106;avascript:x')).toBe('javascript:x');
    expect(decodeHtmlEntities('a &unknown; b')).toBe('a &unknown; b');
  });

  it('an entity-spelled scheme is still that scheme', () => {
    for (const href of [
      '&#106;avascript:alert(1)',
      '&#x6A;avascript:alert(1)',
      '&#106avascript:alert(1)',
      'javascript&colon;alert(1)',
      'java&Tab;script:alert(1)',
      '&#100;ata:text/html,x',
    ]) {
      expect(isSafeChatHref(href)).toBe(false);
      expect(chatLinkAction(href, ORIGIN)).toEqual({ kind: 'block' });
    }
  });

  it('an entity-spelled other origin is not a picture for anyone but an Admin user', () => {
    for (const src of [
      '&#104;ttps://evil.example.test/p.png?d=SECRET',
      '&#47;&#47;evil.example.test/x.png',
      '&sol;&sol;evil.example.test/x.png',
      '&#x2F;&#x2F;evil.example.test/x.png',
      '/&#92;evil.example.test/x.png',
      '/brand/a&amp;b.png',
    ]) {
      expect(chatImageAllowed(src, false)).toBe(false);
    }
    expect(chatImageAllowed('&#104;ttps://evil.example.test/p.png', true)).toBe(true);
    // An `&` in the query is ordinary.
    expect(chatImageAllowed('/brand/logo.png?w=1&h=2', false)).toBe(true);
  });

  it('the owner byte routes are read the way the server routes them', () => {
    for (const src of [
      '/a/../api/files/x',
      '/a/%2e%2e/api/files/x',
      '/api/%66iles/x',
      '/api/%2566iles/x',
      '/%61pi/draws/d-1/svg',
      '/api/files',
      '/API/Files/x',
      '/api//files/x/..',
      '/brand/logo.png?%72aw=1',
    ]) {
      expect(chatImageAllowed(src, false)).toBe(false);
    }
    expect(chatImageAllowed('/api/filesx/y.png', false)).toBe(true);
    expect(chatImageAllowed('/brand/a%20b.png', false)).toBe(true);
  });
});

describe('the last pass over the parsed document', () => {
  const doc = (content: ChatDocNode[]): ChatDocNode => ({ type: 'doc', content });
  const linked = (href: string): ChatDocNode => ({
    type: 'paragraph',
    content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href } }] }],
  });

  it('drops a link whose decoded href is another scheme, keeping its text', () => {
    // What the DOM hands back for `[a](&#106;avascript:alert(1))`.
    const out = sanitizeChatDoc(doc([linked('javascript:alert(1)')]), true);
    expect(out.content![0]!.content![0]).toEqual({ type: 'text', text: 'a', marks: [] });
    const kept = sanitizeChatDoc(doc([linked('https://example.test/a')]), false);
    expect(kept.content![0]!.content![0]!.marks).toEqual([
      { type: 'link', attrs: { href: 'https://example.test/a' } },
    ]);
  });

  it('turns a picture this login may not load into its alt text', () => {
    const image = (attrs: Record<string, unknown>): ChatDocNode => ({ type: 'image', attrs });
    const input = doc([
      // What the DOM hands back for the two entity probes.
      image({ src: 'https://evil.example.test/p.png?d=SECRET', alt: 'i' }),
      image({ src: '//evil.example.test/x.png', alt: '' }),
      image({ src: '/brand/logo.png', nodeId: 'f-1', alt: 'file' }),
      image({ src: '/brand/logo.png', drawId: 'd-1', alt: 'drawing' }),
      image({ src: '/brand/logo.png', alt: 'logo' }),
    ]);
    const out = sanitizeChatDoc(input, false);
    expect(out.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'i' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'file' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'drawing' }] },
      { type: 'image', attrs: { src: '/brand/logo.png', alt: 'logo' } },
    ]);
    // An Admin user keeps every picture.
    expect(sanitizeChatDoc(input, true).content).toEqual(input.content);
  });

  it('reaches into nested blocks', () => {
    const nested = doc([
      {
        type: 'callout',
        content: [
          linked('data:text/html,x'),
          { type: 'image', attrs: { src: 'https://evil.example.test/x.png' } },
        ],
      },
    ]);
    const out = sanitizeChatDoc(nested, false);
    const callout = out.content![0]!;
    expect(callout.content![0]!.content![0]!.marks).toEqual([]);
    expect(callout.content![1]).toEqual({ type: 'paragraph' });
  });
});
