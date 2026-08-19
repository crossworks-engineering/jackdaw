import { describe, expect, it } from 'vitest';
import { remarkHighlight, splitCallouts } from './member-markdown';

describe('splitCallouts', () => {
  it('passes plain markdown through as one segment', () => {
    expect(splitCallouts('# Hi\n\nsome text')).toEqual([
      { kind: 'markdown', text: '# Hi\n\nsome text' },
    ]);
  });

  it('extracts a callout between markdown runs', () => {
    expect(splitCallouts('before\n:::warning\ncareful\n:::\nafter')).toEqual([
      { kind: 'markdown', text: 'before' },
      { kind: 'callout', variant: 'warning', text: 'careful' },
      { kind: 'markdown', text: 'after' },
    ]);
  });

  it('handles every variant and multiple blocks', () => {
    const segs = splitCallouts(':::info\na\n:::\n:::danger\nb\n:::');
    expect(segs).toEqual([
      { kind: 'callout', variant: 'info', text: 'a' },
      { kind: 'callout', variant: 'danger', text: 'b' },
    ]);
  });

  it('ignores ::: lines inside code fences', () => {
    const md = '```\n:::info\nnot a callout\n:::\n```';
    expect(splitCallouts(md)).toEqual([{ kind: 'markdown', text: md }]);
  });

  it('keeps a fenced block INSIDE a callout body intact', () => {
    const segs = splitCallouts(':::info\n```\n:::\n```\n:::');
    expect(segs).toEqual([{ kind: 'callout', variant: 'info', text: '```\n:::\n```' }]);
  });

  it('treats an unclosed opener as plain text (the mid-stream case)', () => {
    expect(splitCallouts('reply so far\n:::info\nstill streaming')).toEqual([
      { kind: 'markdown', text: 'reply so far\n:::info\nstill streaming' },
    ]);
  });

  it('does not open on an unknown variant or an indented opener', () => {
    const unknown = ':::aside\nx\n:::';
    expect(splitCallouts(unknown)[0]).toEqual({ kind: 'markdown', text: unknown });
    const indented = '  :::info\nx\n:::';
    expect(splitCallouts(indented)[0]?.kind).toBe('markdown');
  });
});

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };
const para = (...children: Node[]): Node => ({
  type: 'root',
  children: [{ type: 'paragraph', children }],
});
const text = (value: string): Node => ({ type: 'text', value });
const run = (tree: Node) => {
  remarkHighlight()(tree);
  return (tree.children![0] as Node).children!;
};

describe('remarkHighlight', () => {
  it('wraps ==text== in a mark-rendered node', () => {
    const out = run(para(text('a ==b== c')));
    expect(out).toEqual([
      { type: 'text', value: 'a ' },
      { type: 'emphasis', data: { hName: 'mark' }, children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' c' },
    ]);
  });

  it('handles multiple highlights in one text node', () => {
    const out = run(para(text('==a== and ==b==')));
    expect(out.filter((n) => n.type === 'emphasis')).toHaveLength(2);
  });

  it('leaves a == b alone (space against the marker)', () => {
    const out = run(para(text('a == b')));
    expect(out).toEqual([{ type: 'text', value: 'a == b' }]);
  });

  it('never enters inlineCode (it is not a text node)', () => {
    const code: Node = { type: 'inlineCode', value: '==x==' };
    const out = run(para(code));
    expect(out).toEqual([code]);
  });
});
