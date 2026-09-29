import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentThread, type ThreadComment } from './comment-thread';

/**
 * The thread's delete and chips (client logins C5): the owner may delete
 * every comment; a member and a client only their own (`canDelete`). A
 * client's comment wears the chip the reader's surface names for it.
 */
const comment = (id: string, over: Partial<ThreadComment> = {}): ThreadComment => ({
  id,
  nodeId: 'n-1',
  authorKind: 'member',
  authorName: `Author ${id}`,
  mine: false,
  body: `Body ${id}`,
  createdAt: '2026-09-29T10:00:00.000Z',
  editedAt: null,
  ...over,
});

const render = (props: Partial<Parameters<typeof CommentThread>[0]>) =>
  renderToStaticMarkup(
    createElement(CommentThread, {
      comments: [comment('a', { mine: true }), comment('b', { authorKind: 'client' })],
      roleChip: { client: 'Client' },
      onSend: async () => true,
      ...props,
    }),
  );

const deletes = (html: string) => html.match(/aria-label="Delete comment"/g)?.length ?? 0;

describe('CommentThread', () => {
  it('offers delete on every comment when the surface moderates', () => {
    expect(deletes(render({ onDelete: () => undefined }))).toBe(2);
  });

  it('offers delete on the reader’s own comments only, with canDelete', () => {
    expect(deletes(render({ onDelete: () => undefined, canDelete: (c) => c.mine }))).toBe(1);
  });

  it('offers none without onDelete', () => {
    expect(deletes(render({}))).toBe(0);
  });

  it('marks a client’s comment with the surface’s chip, and names the reader You', () => {
    const html = render({});
    expect(html).toContain('>Client<');
    expect(html).toContain('>You<');
    expect(html).toContain('Author b');
  });
});

/**
 * The audit fixes (client logins C5a): a comment loads no image from
 * anywhere (U5, a tracking pixel), a paged thread offers Load older, the
 * delete stays visible where there is no hover (U10), and the composer has
 * a name.
 */
describe('CommentThread, the C5 audit fixes', () => {
  const pixel = '![seen](https://tracker.example/p.png?who=you)';

  it('draws no image a comment names: its words only, nothing fetched', () => {
    const html = render({
      comments: [comment('a', { body: `Look ${pixel} and ![](/api/files/files/x?raw=1)` })],
    });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toContain('tracker.example');
    expect(html).toContain('[seen]');
    expect(html).toContain('[image]');
  });

  it('keeps a link a link (it loads nothing until clicked)', () => {
    const html = render({ comments: [comment('a', { body: '[the plan](https://example.com)' })] });
    expect(html).toContain('href="https://example.com"');
  });

  it('offers Load older on a paged thread with more, and marks the count', () => {
    const html = render({ hasMore: true, onLoadOlder: () => undefined });
    expect(html).toContain('>Load older<');
    expect(html).toMatch(/\(2<!-- -->\+<!-- -->\)|\(2\+\)/);
  });

  it('offers no Load older on the oldest page, or without a way to load', () => {
    expect(render({ hasMore: false, onLoadOlder: () => undefined })).not.toContain('Load older');
    expect(render({ hasMore: true })).not.toContain('Load older');
  });

  it('hides a delete until hover only where the pointer can hover', () => {
    const html = render({ onDelete: () => undefined });
    const button = html.match(/<button[^>]*aria-label="Delete comment"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('[@media(hover:hover)]:opacity-0');
    expect(button).not.toMatch(/(^|\s|")opacity-0(\s|")/);
  });

  it('names the composer', () => {
    expect(render({})).toContain('aria-label="Write a comment"');
  });
});
