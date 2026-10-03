import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  JSON_CHILD_PAGE,
  JSON_STRING_CLIP,
  JsonView,
  jsonCopyText,
  startsOpen,
  toJsonInput,
} from './json-view';

const html = (props: Parameters<typeof JsonView>[0]) =>
  renderToStaticMarkup(createElement(JsonView, props));

/** Open nodes render their keys; closed ones show a count instead. */
const hasKey = (out: string, key: string) => out.includes(`&quot;${key}&quot;`);

describe('toJsonInput', () => {
  it('parses a string that holds a JSON object or array', () => {
    expect(toJsonInput('{"a":1}')).toEqual({ kind: 'tree', value: { a: 1 } });
    expect(toJsonInput('  [1, 2]\n')).toEqual({ kind: 'tree', value: [1, 2] });
  });

  it('keeps any other string as text, as written', () => {
    expect(toJsonInput('hello')).toEqual({ kind: 'text', text: 'hello' });
    expect(toJsonInput('42')).toEqual({ kind: 'text', text: '42' });
    expect(toJsonInput('"quoted"')).toEqual({ kind: 'text', text: '"quoted"' });
    expect(toJsonInput('{not json')).toEqual({ kind: 'text', text: '{not json' });
    expect(toJsonInput('')).toEqual({ kind: 'text', text: '' });
  });

  it('passes non-strings through as a tree', () => {
    const obj = { a: [1] };
    expect(toJsonInput(obj)).toEqual({ kind: 'tree', value: obj });
    expect(toJsonInput(null)).toEqual({ kind: 'tree', value: null });
    expect(toJsonInput(7)).toEqual({ kind: 'tree', value: 7 });
  });
});

describe('jsonCopyText', () => {
  it('copies a tree as indented JSON and text as itself', () => {
    expect(jsonCopyText(toJsonInput('{"a":1}'))).toBe('{\n  "a": 1\n}');
    expect(jsonCopyText(toJsonInput('plain'))).toBe('plain');
  });

  it('does not throw on values JSON cannot hold', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => jsonCopyText({ kind: 'tree', value: loop })).not.toThrow();
    expect(jsonCopyText({ kind: 'tree', value: 10n })).toBe('"10"');
  });
});

describe('startsOpen', () => {
  it('opens nodes above the collapse depth only', () => {
    expect(startsOpen(0, 2, 3)).toBe(true);
    expect(startsOpen(1, 2, 3)).toBe(true);
    expect(startsOpen(2, 2, 3)).toBe(false);
    expect(startsOpen(0, 0, 3)).toBe(false);
  });

  it('keeps a node with more than one page of children closed', () => {
    expect(startsOpen(0, 5, JSON_CHILD_PAGE)).toBe(true);
    expect(startsOpen(0, 5, JSON_CHILD_PAGE + 1)).toBe(false);
  });
});

describe('JsonView render', () => {
  const value = { top: { mid: { deep: 1 } } };

  it('opens two levels by default', () => {
    const out = html({ value });
    expect(hasKey(out, 'top')).toBe(true);
    expect(hasKey(out, 'mid')).toBe(true);
    // "mid" is at depth 2: shown as a closed row with its count.
    expect(hasKey(out, 'deep')).toBe(false);
    expect(out).toContain('1 key');
  });

  it('follows collapseDepth', () => {
    expect(hasKey(html({ value, collapseDepth: 1 }), 'mid')).toBe(false);
    expect(hasKey(html({ value, collapseDepth: 3 }), 'deep')).toBe(true);
  });

  it('renders a JSON string as a tree and other text as text', () => {
    expect(hasKey(html({ value: JSON.stringify(value) }), 'top')).toBe(true);
    const text = html({ value: 'just words' });
    expect(text).toContain('<pre');
    expect(text).toContain('just words');
  });

  it('clips long strings until asked', () => {
    const long = 'x'.repeat(JSON_STRING_CLIP + 50);
    const out = html({ value: { s: long } });
    expect(out).not.toContain(long);
    expect(out).toContain(`show all (${long.length} chars)`);
  });

  it('pages a large array instead of mounting every row', () => {
    const big = Array.from({ length: JSON_CHILD_PAGE + 5 }, (_, i) => i);
    // Over one page: starts closed even at the root.
    expect(html({ value: { big } })).toContain(`${big.length} items`);
  });

  it('caps the scroll area with a thin scrollbar', () => {
    const out = html({ value, maxHeight: 200 });
    expect(out).toContain('scrollbar-thin');
    expect(out).toContain('max-height:200px');
  });
});
