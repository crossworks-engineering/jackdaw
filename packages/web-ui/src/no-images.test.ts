import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { NO_IMAGES } from './no-images';

const render = (md: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { components: NO_IMAGES }, md));

describe('NO_IMAGES', () => {
  it('draws no image the markdown names: its words only, nothing fetched', () => {
    const html = render(
      'Look ![seen](https://tracker.example/p.png?who=you) and ![](/api/files/files/x?raw=1)',
    );
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain('tracker.example');
    expect(html).toContain('[seen]');
    expect(html).toContain('[image]');
  });

  it('keeps a link a link (it loads nothing until clicked)', () => {
    expect(render('[the plan](https://example.com)')).toContain('href="https://example.com"');
  });
});
