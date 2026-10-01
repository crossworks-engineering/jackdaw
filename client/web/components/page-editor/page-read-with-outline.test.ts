import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { ReadOnlyItemBody, type ReaderAssets } from '@/components/member/read-only-item';
import { SpaceItemView } from '@/components/member/space-item-view';
import { ReviewItemView } from '@/components/team-admin/review-tab';
import type { ReviewItem } from '@/lib/member-review';
import type { SpaceItem } from '@/lib/member-space';
import { PageReadWithOutline, closeThenJump, readerToc } from './page-read-with-outline';

/**
 * The heading outline for the READERS of a page (a member, a client, a
 * reviewer): one wrapper, used by every read view, built from the doc the
 * view renders.
 *
 * The render tests run on the server render, where the document body itself
 * is not drawn yet (StaticDoc renders in an effect) but the outline is: it
 * comes from the doc, not from the DOM.
 */
const heading = (id: string, level: number, text: string): JSONContent => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text }],
});
const para = (id: string, text: string): JSONContent => ({
  type: 'paragraph',
  attrs: { id },
  content: [{ type: 'text', text }],
});
const folderIndex = (id: string): JSONContent => ({
  type: 'folderIndex',
  attrs: { id, folderId: null },
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

const LONG = doc(
  heading('h-intro', 1, 'Introduction'),
  para('p-1', 'Some words.'),
  heading('h-scope', 2, 'Scope'),
  folderIndex('fi-1'),
  heading('h-detail', 3, 'The detail'),
  para('p-2', 'More words.'),
);
const FLAT = doc(para('p-1', 'Only a paragraph.'), folderIndex('fi-1'));

/** The rail (PageOutline's nav) and the narrow disclosure (its own nav). */
const RAIL = 'aria-label="Page outline"';
const DISCLOSURE = 'aria-label="On this page"';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient(), children: el }),
  );

function expectOutline(html: string) {
  expect(html).toContain(RAIL);
  expect(html).toContain(DISCLOSURE);
  for (const label of ['Introduction', 'Scope', 'The detail']) expect(html).toContain(label);
}
function expectNoOutline(html: string) {
  expect(html).not.toContain(RAIL);
  expect(html).not.toContain(DISCLOSURE);
  expect(html).not.toContain('<nav');
}

describe('readerToc', () => {
  it('lists the headings in document order, indented by level', () => {
    expect(readerToc(LONG)).toEqual([
      { id: 'h-intro', kind: 'heading', level: 1, depth: 0, label: 'Introduction' },
      { id: 'h-scope', kind: 'heading', level: 2, depth: 1, label: 'Scope' },
      { id: 'h-detail', kind: 'heading', level: 3, depth: 2, label: 'The detail' },
    ]);
  });

  it('gives no entries for a page without headings', () => {
    expect(readerToc(FLAT)).toEqual([]);
    expect(readerToc(doc())).toEqual([]);
    expect(readerToc(null)).toEqual([]);
  });

  it('never lists a Folder index block or a paragraph', () => {
    const ids = readerToc(LONG).map((e) => e.id);
    expect(ids).not.toContain('fi-1');
    expect(ids).not.toContain('p-1');
  });

  it('reads the doc it is given: a draft and a saved version differ', () => {
    const saved = doc(heading('h-a', 1, 'Saved title'));
    const draft = doc(heading('h-a', 1, 'Draft title'), heading('h-b', 2, 'New section'));
    expect(readerToc(saved).map((e) => e.label)).toEqual(['Saved title']);
    expect(readerToc(draft).map((e) => e.label)).toEqual(['Draft title', 'New section']);
  });
});

describe('PageReadWithOutline', () => {
  it('draws the rail and the narrow disclosure for a page with headings', () => {
    const html = render(createElement(PageReadWithOutline, { content: LONG }));
    expectOutline(html);
    // The admin preview's rail (224px wide, sticky), shown when the READER
    // is wide enough for it, not the window.
    expect(html).toContain('@container/page-read');
    expect(html).toContain('hidden w-56 shrink-0 @2xl/page-read:block');
    expect(html).toContain('sticky top-6');
    // The disclosure: only where the rail is not, closed until asked for.
    expect(html).toMatch(/<nav aria-label="On this page" class="[^"]*@2xl\/page-read:hidden/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<ul[^>]*hidden=""/);
  });

  it('draws neither for a page without headings', () => {
    expectNoOutline(render(createElement(PageReadWithOutline, { content: FLAT })));
  });

  it('every entry is a real button, in the rail and in the disclosure', () => {
    const html = render(createElement(PageReadWithOutline, { content: LONG }));
    // 3 entries in each list, the rail's Hide button and the disclosure's row.
    expect(html.match(/<button type="button"/g)).toHaveLength(8);
    expect(html).not.toContain('<a ');
  });
});

describe('a jump from the narrow disclosure closes it', () => {
  it('closes the list first, then jumps to the entry asked for', () => {
    const calls: string[] = [];
    closeThenJump(
      () => calls.push('close'),
      (id) => calls.push(`jump:${id}`),
      'h-scope',
    );
    expect(calls).toEqual(['close', 'jump:h-scope']);
  });

  it('the disclosure entries go through it, with a close that reaches the DOM at once', () => {
    const src = readFileSync(new URL('./page-read-with-outline.tsx', import.meta.url), 'utf8');
    expect(src).toContain('const close = () => flushSync(() => setOpen(false));');
    expect(src).toContain('onClick={() => closeThenJump(close, onJump, e.id)}');
    // One use: the entries. The row that opens the list only toggles it.
    expect(src.match(/closeThenJump\(close,/g)).toHaveLength(1);
  });

  it('the rail jumps without it: PageOutline gets the plain jump', () => {
    const src = readFileSync(new URL('./page-read-with-outline.tsx', import.meta.url), 'utf8');
    expect(src).toContain('<PageOutline entries={toc} onJump={jump} />');
  });
});

const ASSETS: ReaderAssets = {
  mapAssetPath: (p) => p,
  drawUrlPath: (id) => `/draw/${id}`,
  fileUrlPath: (id) => `/file/${id}`,
};

const libraryPage = (content: JSONContent) =>
  createElement(ReadOnlyItemBody, {
    item: { id: 'i-1', title: 'A page', icon: null, type: 'page', doc: content, folderId: null },
    assets: ASSETS,
    onPickTab: () => {},
  });

const spaceItem = (saved: JSONContent, draft: JSONContent | null = null) =>
  ({
    row: { id: 'i-2', type: 'page', title: 'A page', icon: null },
    body: { type: 'page', page: { doc: saved, draft } },
  }) as unknown as SpaceItem;

const reviewItem = (content: JSONContent) =>
  ({
    row: { id: 'i-3', type: 'page', title: 'A page', icon: null },
    body: { type: 'page', page: { doc: content, draft: null } },
    comments: [],
  }) as unknown as ReviewItem;

describe('the outline in each reader', () => {
  it('a Library, accepted or client shared page (ReadOnlyItemBody)', () => {
    expectOutline(render(libraryPage(LONG)));
    expectNoOutline(render(libraryPage(FLAT)));
  });

  it("a member's or client's own page and a teammate's shared page (SpaceItemView)", () => {
    for (const source of ['mine', 'team'] as const) {
      expectOutline(render(createElement(SpaceItemView, { source, item: spaceItem(LONG) })));
      expectNoOutline(render(createElement(SpaceItemView, { source, item: spaceItem(FLAT) })));
    }
  });

  it('SpaceItemView outlines the version it shows: the draft only when working', () => {
    const item = spaceItem(FLAT, LONG);
    expectNoOutline(render(createElement(SpaceItemView, { source: 'mine', item })));
    expectOutline(render(createElement(SpaceItemView, { source: 'mine', item, working: true })));
  });

  it('a submitted page in the admin Review pane (ReviewItemView)', () => {
    expectOutline(render(createElement(ReviewItemView, { item: reviewItem(LONG) })));
    expectNoOutline(render(createElement(ReviewItemView, { item: reviewItem(FLAT) })));
  });
});

describe('no reader draws a page without the outline wrapper', () => {
  it('nothing under member, client or team-admin imports PageView itself', () => {
    const components = fileURLToPath(new URL('..', import.meta.url));
    const seen: string[] = [];
    for (const dir of ['member', 'client', 'team-admin']) {
      for (const f of readdirSync(`${components}/${dir}`)) {
        if (!f.endsWith('.tsx')) continue;
        seen.push(`${dir}/${f}`);
        const src = readFileSync(`${components}/${dir}/${f}`, 'utf8');
        expect(src, `${dir}/${f}`).not.toMatch(/page-editor\/page-view['"]/);
        expect(src, `${dir}/${f}`).not.toMatch(/<PageView\b/);
      }
    }
    expect(seen).toEqual(
      expect.arrayContaining([
        'member/read-only-item.tsx',
        'member/space-item-view.tsx',
        'team-admin/review-tab.tsx',
      ]),
    );
  });
});
