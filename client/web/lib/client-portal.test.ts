import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { NotePresenter } from '@mantle/web-ui/share/note-presenter';
import { QueryClient } from '@tanstack/react-query';
import {
  CLIENT_ITEM_KEY,
  CLIENT_LINK_NOT_VALID,
  CLIENT_PRIVATE_LABEL,
  CLIENT_SHARED_KEY,
  CLIENT_SHELL_POLL_MS,
  clientAssetPath,
  clientDoc,
  clientEmailError,
  clientLinkItemId,
  clientMentionItemId,
  clientNoteImagePath,
  clientNoteMarkdown,
  clientPortalView,
  clientShellPollMs,
  clientSignInOutcome,
  isNewShellAnswer,
  readClientCode,
  refreshClientPortal,
  sharedItemPath,
  sharedListPath,
} from './client-portal';

/**
 * The client portal's pure rules (client logins C2): its routes, what the
 * sign-in answers mean, when the portal draws, and that a reference the
 * brain redacted is plain text, never a link.
 */
const ID = '11111111-1111-4111-8111-111111111111';

describe('client routes', () => {
  it('lists shared items by kind, title and page', () => {
    expect(sharedListPath({})).toBe('/api/client/shared?page=1');
    expect(sharedListPath({ kind: 'note', q: ' plan ', page: 3 })).toBe(
      '/api/client/shared?kind=note&q=plan&page=3',
    );
  });

  it('reads one item, a table tab at a time', () => {
    expect(sharedItemPath(ID)).toBe(`/api/client/shared/${ID}`);
    expect(sharedItemPath(ID, 't 1')).toBe(`/api/client/shared/${ID}?tab=t%201`);
  });

  it('maps a page document asset path onto the client byte routes', () => {
    expect(clientAssetPath(`/api/files/files/${ID}?raw=1`)).toBe(`/api/client/files/${ID}`);
    expect(clientAssetPath(`/api/draws/${ID}/svg`)).toBe(`/api/client/draws/${ID}/svg`);
    expect(clientAssetPath('https://example.invalid/a.png')).toBe('https://example.invalid/a.png');
  });

  it('maps a note picture onto the client byte routes, and drops any other (U4)', () => {
    expect(clientNoteImagePath(`/api/files/files/${ID}?raw=1`)).toBe(`/api/client/files/${ID}`);
    expect(clientNoteImagePath(`media:${ID}`)).toBe(`/api/client/files/${ID}`);
    expect(clientNoteImagePath(`draw:${ID}`)).toBe(`/api/client/draws/${ID}/svg`);
    expect(clientNoteImagePath(`/api/draws/${ID}/svg`)).toBe(`/api/client/draws/${ID}/svg`);
    for (const other of [
      'https://tracker.example/p.gif',
      'data:image/png;base64,AAAA',
      `/api/member/files/${ID}`,
      `/api/pages/${ID}`,
      `media:${ID}/../x`,
      '',
    ]) {
      expect(clientNoteImagePath(other), other).toBeNull();
    }
  });
});

describe('clientDoc: a redacted reference is plain text', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          // The brain's redaction of a mention: no target, the label.
          { type: 'mention', attrs: { id: null, label: CLIENT_PRIVATE_LABEL, ref: 'node' } },
          { type: 'text', text: ' and ' },
          // ...and of a link: the label, pointing nowhere.
          {
            type: 'text',
            text: CLIENT_PRIVATE_LABEL,
            marks: [{ type: 'link', attrs: { href: null } }, { type: 'bold' }],
          },
          { type: 'text', text: ' and ' },
          {
            type: 'text',
            text: 'the brief',
            marks: [{ type: 'link', attrs: { href: `/n/${ID}` } }],
          },
          { type: 'mention', attrs: { id: ID, label: 'Project brief', ref: 'node' } },
        ],
      },
    ],
  };
  const out = clientDoc(doc);
  const para = out.content![0]!.content!;

  it('a private mention becomes its label, as text', () => {
    expect(para[1]).toEqual({ type: 'text', text: CLIENT_PRIVATE_LABEL });
  });

  it('a private link keeps its text and every other mark, and loses the link', () => {
    expect(para[3]).toEqual({
      type: 'text',
      text: CLIENT_PRIVATE_LABEL,
      marks: [{ type: 'bold' }],
    });
  });

  it('a mention with an empty id, or a link with an empty href, is private too', () => {
    const d = clientDoc({
      type: 'doc',
      content: [
        { type: 'mention', attrs: { id: '', label: 'Something' } },
        { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '  ' } }] },
      ],
    });
    expect(d.content).toEqual([
      { type: 'text', text: CLIENT_PRIVATE_LABEL },
      { type: 'text', text: 'x' },
    ]);
  });

  it('leaves real references alone, and does not touch the input', () => {
    expect(para[5]!.marks).toEqual([{ type: 'link', attrs: { href: `/n/${ID}` } }]);
    expect(para[6]).toEqual({
      type: 'mention',
      attrs: { id: ID, label: 'Project brief', ref: 'node' },
    });
    expect(doc.content![0]!.content![1]!.type).toBe('mention');
    expect(JSON.stringify(out)).not.toContain('"href":null');
  });
});

describe('clientNoteMarkdown: a redacted link renders as plain text', () => {
  const note = `Read [${CLIENT_PRIVATE_LABEL}]() first, then [the brief](/n/${ID}) and [${CLIENT_PRIVATE_LABEL}](#). ![a picture](/x.png) [empty]()`;
  const md = clientNoteMarkdown(note);

  it('drops the link and keeps the text', () => {
    expect(md).toBe(
      `Read ${CLIENT_PRIVATE_LABEL} first, then [the brief](/n/${ID}) and ${CLIENT_PRIVATE_LABEL}. ![a picture](/x.png) empty`,
    );
  });

  it('renders no anchor for it', () => {
    const html = renderToStaticMarkup(
      createElement(NotePresenter, { view: { title: 'n', content: md }, chrome: 'embedded' }),
    );
    expect(html).toContain(CLIENT_PRIVATE_LABEL);
    expect(html).not.toMatch(new RegExp(`<a[^>]*>${CLIENT_PRIVATE_LABEL}</a>`));
    expect(html).toMatch(/<a href="\/n\/[^"]+">the brief<\/a>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('a private label linked anywhere is still plain text', () => {
    expect(clientNoteMarkdown(`[${CLIENT_PRIVATE_LABEL}](/n/${ID})`)).toBe(CLIENT_PRIVATE_LABEL);
  });
});

describe('clientLinkItemId', () => {
  const origin = 'https://app.example.invalid';
  it('opens the brain item routes on this app in the portal', () => {
    expect(clientLinkItemId(`/n/${ID}`, origin)).toBe(ID);
    expect(clientLinkItemId(`${origin}/pages/${ID}`, origin)).toBe(ID);
  });
  it('leaves every other link alone', () => {
    expect(clientLinkItemId(`https://other.example.invalid/n/${ID}`, origin)).toBeNull();
    expect(clientLinkItemId('/settings', origin)).toBeNull();
    expect(clientLinkItemId('mailto:a@example.invalid', origin)).toBeNull();
    expect(clientLinkItemId(null, origin)).toBeNull();
  });
});

describe('sign-in', () => {
  it('ok only on a 2xx that says ok', () => {
    expect(clientSignInOutcome(200, { ok: true })).toEqual({ kind: 'ok' });
    expect(clientSignInOutcome(200, {}).kind).toBe('error');
  });

  it('one sentence for every 401, and one for the rate limit', () => {
    expect(clientSignInOutcome(401, { error: 'anything' })).toEqual({
      kind: 'not-valid',
      message: 'This sign-in link is not valid. Ask for a new one.',
    });
    expect(CLIENT_LINK_NOT_VALID).toBe('This sign-in link is not valid. Ask for a new one.');
    expect(clientSignInOutcome(429, null)).toEqual({
      kind: 'error',
      message: 'Too many attempts. Try again in a minute.',
    });
    expect(clientSignInOutcome(500, null).kind).toBe('error');
  });

  it('reads the code without whitespace, and checks the email', () => {
    expect(readClientCode(' ab cd\n')).toBe('abcd');
    expect(readClientCode(null)).toBe('');
    expect(clientEmailError('')).toBe('Enter your email address.');
    expect(clientEmailError('nope')).toBe('That does not look like an email address.');
    expect(clientEmailError(' pat@example.invalid ')).toBeNull();
  });
});

describe('the client shell', () => {
  it('is polled every minute, sooner when the asset token needs it', () => {
    expect(clientShellPollMs(null)).toBe(CLIENT_SHELL_POLL_MS);
    expect(clientShellPollMs('')).toBe(CLIENT_SHELL_POLL_MS);
    // An unparseable token asks at the kit's own cadence, never later than a minute.
    expect(clientShellPollMs('not-a-token')).toBeLessThanOrEqual(CLIENT_SHELL_POLL_MS);
  });

  it('draws the portal only once the shell answered', () => {
    expect(clientPortalView({})).toBe('loading');
    expect(clientPortalView({ data: { role: 'client' } })).toBe('ready');
    expect(clientPortalView({ error: new ApiError('nf', 404) })).toBe('unavailable');
    expect(clientPortalView({ error: new ApiError('unauthorized', 401) })).toBe('loading');
    expect(clientPortalView({ error: new ApiError('boom', 500) })).toBe('failed');
    expect(clientPortalView({ error: new TypeError('fetch failed') })).toBe('failed');
    // A failed refetch keeps the portal that already drew.
    expect(clientPortalView({ data: { role: 'client' }, error: new ApiError('x', 500) })).toBe(
      'ready',
    );
  });
});

describe('the portal offline (audit B27)', () => {
  it('a first ask parked offline is the failure card (with Sign out), not Loading', () => {
    expect(clientPortalView({ fetchStatus: 'paused' })).toBe('offline');
    // Once drawn, the portal stays drawn when the network drops.
    expect(clientPortalView({ data: { role: 'client' }, fetchStatus: 'paused' })).toBe('ready');
    expect(clientPortalView({ fetchStatus: 'fetching' })).toBe('loading');
  });

  it('the portal draws the failure card for offline, never the loading screen', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const portal = readFileSync(
      fileURLToPath(new URL('../components/client/client-portal.tsx', import.meta.url)),
      'utf8',
    );
    expect(portal).toMatch(
      /case 'offline':\s*return \(\s*<RoleProbeFailedScreen\s+fullScreen\s+client\s+failure="offline"/,
    );
  });
});

describe('the portal stays fresh (audit B27)', () => {
  const seeded = () => {
    const qc = new QueryClient();
    qc.setQueryData([...CLIENT_SHARED_KEY, { kind: null, q: '', page: 1 }], { items: [] });
    qc.setQueryData([...CLIENT_ITEM_KEY, 'a', null], { item: {} });
    qc.setQueryData(['client-shell'], { role: 'client' });
    return qc;
  };
  const stale = (qc: QueryClient, key: readonly unknown[]) =>
    qc.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;

  it('asks the list and the open item again, and leaves the shell alone', async () => {
    const qc = seeded();
    await refreshClientPortal(qc);
    expect(stale(qc, [...CLIENT_SHARED_KEY, { kind: null, q: '', page: 1 }])).toBe(true);
    expect(stale(qc, [...CLIENT_ITEM_KEY, 'a', null])).toBe(true);
    expect(stale(qc, ['client-shell'])).toBe(false);
  });

  it('on every NEW successful shell answer, not the first', () => {
    expect(isNewShellAnswer(0, 1000)).toBe(false);
    expect(isNewShellAnswer(1000, 1000)).toBe(false);
    expect(isNewShellAnswer(1000, 61_000)).toBe(true);
  });

  it('the portal refreshes on each new shell answer and on window focus', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const portal = readFileSync(
      fileURLToPath(new URL('../components/client/client-portal.tsx', import.meta.url)),
      'utf8',
    );
    expect(portal).toContain('useFreshList(query.dataUpdatedAt);');
    expect(portal).toMatch(
      /if \(isNewShellAnswer\(last\.current, dataUpdatedAt\)\) void refreshClientPortal\(queryClient\);/,
    );
    expect(portal).toMatch(
      /const onFocus = \(\) => void refreshClientPortal\(queryClient\);\s*window\.addEventListener\('focus', onFocus\);/,
    );
  });
});

describe('references a client may read open (audit B27)', () => {
  const ID2 = '22222222-2222-4222-8222-222222222222';

  it('a mention chip of a brain item opens it', () => {
    expect(clientMentionItemId({ id: ID2, ref: 'node', label: 'Plan' })).toBe(ID2);
  });

  it('a redacted chip, an entity chip or a chip with no id opens nothing', () => {
    expect(clientMentionItemId({ id: null, ref: 'node', label: CLIENT_PRIVATE_LABEL })).toBeNull();
    expect(clientMentionItemId({ id: ID2, ref: 'node', label: CLIENT_PRIVATE_LABEL })).toBeNull();
    expect(clientMentionItemId({ id: ID2, ref: 'entity', label: 'Sam' })).toBeNull();
    expect(clientMentionItemId({ id: '  ', ref: 'node', label: 'Plan' })).toBeNull();
  });
});
