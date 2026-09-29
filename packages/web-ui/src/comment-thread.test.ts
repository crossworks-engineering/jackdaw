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
