import { describe, expect, it } from 'vitest';
import { buildPageToc } from '@mantle/content-core/page-toc';
import { sameToc } from './toc-equal';

const heading = (id: string, level: number, text: string) => ({
  type: 'heading',
  attrs: { id, level },
  content: [{ type: 'text', text }],
});
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const childPage = (id: string, title: string) => ({ type: 'childPage', attrs: { id, title } });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('sameToc', () => {
  it('holds across an edit that does not touch the outline', () => {
    // The case that matters: typing inside a paragraph. buildPageToc returns a
    // fresh array both times, so reference equality would say "changed".
    const before = buildPageToc(doc(heading('h1', 1, 'Intro'), para('hello')));
    const after = buildPageToc(doc(heading('h1', 1, 'Intro'), para('hello world')));
    expect(before).not.toBe(after);
    expect(sameToc(before, after)).toBe(true);
  });

  it('notices a renamed heading', () => {
    const before = buildPageToc(doc(heading('h1', 1, 'Intro')));
    const after = buildPageToc(doc(heading('h1', 1, 'Introduction')));
    expect(sameToc(before, after)).toBe(false);
  });

  it('notices a heading changing level, which moves its indentation', () => {
    const before = buildPageToc(doc(heading('h1', 1, 'Intro')));
    const after = buildPageToc(doc(heading('h1', 2, 'Intro')));
    expect(sameToc(before, after)).toBe(false);
  });

  it('notices an added, removed or reordered heading', () => {
    const a = buildPageToc(doc(heading('h1', 1, 'One')));
    const b = buildPageToc(doc(heading('h1', 1, 'One'), heading('h2', 1, 'Two')));
    expect(sameToc(a, b)).toBe(false);
    expect(sameToc(b, a)).toBe(false);
    const swapped = buildPageToc(doc(heading('h2', 1, 'Two'), heading('h1', 1, 'One')));
    expect(sameToc(b, swapped)).toBe(false);
  });

  it('notices a sub-page card being retitled', () => {
    const before = buildPageToc(doc(childPage('p1', 'Notes')));
    const after = buildPageToc(doc(childPage('p1', 'Meeting notes')));
    expect(sameToc(before, after)).toBe(false);
  });

  it('notices a sub-page moving under a different heading, which re-indents it', () => {
    // Same entries, same ids — only `depth`/`level` move, because a sub-page
    // nests under the heading section it falls in.
    const before = buildPageToc(doc(childPage('p1', 'Notes')));
    const after = buildPageToc(doc(heading('h1', 2, 'Section'), childPage('p1', 'Notes')));
    const beforeCard = before.find((e) => e.id === 'p1')!;
    const afterCard = after.find((e) => e.id === 'p1')!;
    expect(beforeCard.depth).not.toBe(afterCard.depth);
    expect(sameToc(before, after)).toBe(false);
  });

  it('is reflexive and handles empty outlines', () => {
    const empty = buildPageToc(doc(para('no headings here')));
    expect(empty).toEqual([]);
    expect(sameToc(empty, buildPageToc(doc(para('still none'))))).toBe(true);
    const one = buildPageToc(doc(heading('h1', 1, 'Intro')));
    expect(sameToc(one, one)).toBe(true);
    expect(sameToc(empty, one)).toBe(false);
  });
});
