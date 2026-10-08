import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoteMarkdown } from '@/components/note-markdown';
import { clientNoteImagePath } from './client-portal';
import { memberAssetPath } from './member-assets';
import { reviewAssetPath } from './member-review';
import { noteAssetPath, noteRefPath, ownerNoteAssetPath } from './note-media';

const FILE = '0e5c1a4e-1111-2222-3333-444455556666';
const DRAW = '7d1f2a3b-4444-5555-6666-777788889999';
const SUB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** The form Main and the agents write into a note. */
const NOTE = [
  'Step one.',
  '',
  `![the form](media:${FILE})`,
  '',
  `Open ![the plan](draw:${DRAW}) and [spec.pdf](media:${FILE}), or [docs](https://example.invalid/d).`,
].join('\n');

const render = (assetPath: (src: string) => string | null) =>
  renderToStaticMarkup(createElement(NoteMarkdown, { content: NOTE, assetPath }));

describe('noteRefPath', () => {
  it('names the same admin byte paths a page image carries', () => {
    expect(noteRefPath(`media:${FILE}`)).toBe(`/api/files/files/${FILE}?raw=1`);
    expect(noteRefPath(`draw:${DRAW}`)).toBe(`/api/draws/${DRAW}/svg?raw=1`);
  });

  it('is null for every other href', () => {
    for (const href of ['https://x/y.png', '/x.png', `page:${FILE}`, 'media:', ''])
      expect(noteRefPath(href), href).toBeNull();
  });
});

describe('noteAssetPath', () => {
  it('the owner keeps the brain routes', () => {
    expect(ownerNoteAssetPath(`media:${FILE}`)).toBe(`/api/files/files/${FILE}?raw=1`);
    expect(ownerNoteAssetPath('https://example.invalid/a.png')).toBe(
      'https://example.invalid/a.png',
    );
  });

  it('a member reads a reference from the member routes, as a page does', () => {
    const member = noteAssetPath(memberAssetPath);
    expect(member(`media:${FILE}`)).toBe(`/api/member/files/${FILE}`);
    expect(member(`draw:${DRAW}`)).toBe(`/api/member/draws/${DRAW}/svg`);
    // A hand-written admin path maps too, instead of asking a route the
    // member is refused on.
    expect(member(`/api/files/files/${FILE}`)).toBe(`/api/member/files/${FILE}`);
  });

  it('the review queue reads it from the submission', () => {
    const review = noteAssetPath((p) => reviewAssetPath(SUB, p));
    expect(review(`media:${FILE}`)).toBe(`/api/team-admin/submissions/${SUB}/bytes?node=${FILE}`);
  });

  it('drops an unsafe src', () => {
    expect(ownerNoteAssetPath('javascript:alert(1)')).toBeNull();
  });
});

describe('NoteMarkdown', () => {
  it('the owner sees the pictures and the file link', () => {
    const html = render(ownerNoteAssetPath);
    expect(html).toContain(`<img src="/api/files/files/${FILE}?raw=1" alt="the form"/>`);
    expect(html).toContain(`<img src="/api/draws/${DRAW}/svg?raw=1" alt="the plan"/>`);
    expect(html).toContain(
      `<a href="/api/files/files/${FILE}?raw=1" target="_blank" rel="noopener noreferrer">spec.pdf</a>`,
    );
    expect(html).toContain('<a href="https://example.invalid/d">docs</a>');
    expect(html).not.toContain('media:');
    expect(html).not.toContain('draw:');
  });

  it('a member sees them from the member routes', () => {
    const html = render(noteAssetPath(memberAssetPath));
    expect(html).toContain(`<img src="/api/member/files/${FILE}" alt="the form"/>`);
    expect(html).toContain(`<img src="/api/member/draws/${DRAW}/svg" alt="the plan"/>`);
    expect(html).toContain(`<a href="/api/member/files/${FILE}"`);
  });

  it('a client sees them from the client routes', () => {
    const html = render(clientNoteImagePath);
    expect(html).toContain(`<img src="/api/client/files/${FILE}" alt="the form"/>`);
    expect(html).toContain(`<img src="/api/client/draws/${DRAW}/svg" alt="the plan"/>`);
    expect(html).toContain(`<a href="/api/client/files/${FILE}"`);
  });

  it('a reference the reader may not read is its text, never a request', () => {
    const html = render(() => null);
    expect(html).not.toContain('<img');
    expect(html).toContain('[the form]');
    expect(html).toContain('<span>spec.pdf</span>');
    // An ordinary link is not a reference and stays a link.
    expect(html).toContain('<a href="https://example.invalid/d">docs</a>');
  });
});
