import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { padAsideFences, remarkAsides } from './doc-asides';
import { DocAside } from '@/components/doc-aside';

function render(md: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm, remarkAsides], components: { aside: DocAside } },
      padAsideFences(md),
    ),
  );
}

describe('docs reader asides', () => {
  it('renders a titled note as a callout with the body as markdown', () => {
    // The shape mantle docs/guide uses: no blank line after the open fence.
    const html = render(
      [
        'Intro.',
        '',
        ':::note[What OpenRouter is for]',
        'One key that reaches **many** models.',
        '',
        'Set a [credit limit](https://openrouter.ai/keys).',
        ':::',
        '',
        'After.',
      ].join('\n'),
    );
    expect(html).toContain('<aside aria-label="What OpenRouter is for" data-aside-type="note"');
    expect(html).toContain('border-info/30');
    expect(html).toContain('What OpenRouter is for</p>');
    expect(html).toContain('<strong>many</strong>');
    expect(html).toContain('href="https://openrouter.ai/keys"');
    expect(html).not.toContain(':::');
    // Prose before and after stays outside the box.
    expect(html.indexOf('<p>Intro.</p>')).toBeLessThan(html.indexOf('<aside'));
    expect(html.indexOf('</aside>')).toBeLessThan(html.indexOf('<p>After.</p>'));
  });

  it('maps each kind to its own tint and gives a default title', () => {
    const html = render(':::tip\nA.\n:::\n\n:::caution\nB.\n:::\n\n:::danger[Stop]\nC.\n:::');
    expect(html).toContain('aria-label="Tip" data-aside-type="tip"');
    expect(html).toContain('border-success/30');
    expect(html).toContain('aria-label="Caution" data-aside-type="caution"');
    expect(html).toContain('border-warning/30');
    expect(html).toContain('aria-label="Stop" data-aside-type="danger"');
    expect(html).toContain('border-destructive/30');
  });

  it('keeps a list inside the box when the close fence follows it directly', () => {
    const html = render(':::note\n- one\n- two\n:::\n\nAfter.');
    expect(html).toMatch(/<aside[^>]*>.*<ul>.*<li>two<\/li>.*<\/ul>.*<\/aside>/s);
    expect(html).not.toContain(':::');
  });

  it('leaves fences inside code blocks and unclosed fences as text', () => {
    const code = render('```md\n:::note[Example]\nbody\n:::\n```');
    expect(code).not.toContain('<aside');
    expect(code).toContain(':::note[Example]');

    const unclosed = render(':::note[Open]\nNo close.');
    expect(unclosed).not.toContain('<aside');
    expect(unclosed).toContain(':::note[Open]');
  });

  it('does not touch other colon text or unknown kinds', () => {
    const html = render('Ratio a:b at 10:30.\n\n:::info\nNot an aside kind.\n:::');
    expect(html).not.toContain('<aside');
    expect(html).toContain('Ratio a:b at 10:30.');
  });

  it('padAsideFences only pads fence lines', () => {
    expect(padAsideFences('a\n:::note[T]\nb\n:::\nc')).toBe('a\n\n:::note[T]\n\nb\n\n:::\n\nc');
    expect(padAsideFences('a\n:::\nb')).toBe('a\n:::\nb');
  });
});
