/**
 * The move dialog's lines (W5b2, 21.8 rows 1 and 9): what the item becomes
 * visible to, where it stops, and "Keep it readable in H" for the old home.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MovePreviewLines } from './grant-dialogs';

const lines = (over: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(MovePreviewLines, {
      preview: { alsoVisibleTo: [], removedFrom: [] },
      keep: false,
      onKeep: () => {},
      ...over,
    }),
  );

describe('MovePreviewLines', () => {
  it('says what it becomes visible to', () => {
    const html = lines({
      preview: { alsoVisibleTo: [{ wsId: 'c', name: 'Client A' }], removedFrom: [] },
    });
    expect(html).toContain('This will also be visible to: Client A.');
  });

  it('offers Keep it readable in the old home', () => {
    const html = lines({
      preview: {
        alsoVisibleTo: [{ wsId: 's', name: 'Sales' }],
        removedFrom: [{ wsId: 'h', name: 'Team' }],
      },
      oldHome: { wsId: 'h', name: 'Team' },
    });
    expect(html).toContain('It will no longer be readable in: Team.');
    expect(html).toContain('Keep it readable in Team');
  });

  it('no Keep offer for a workspace that is not the old home (a folder move)', () => {
    const html = lines({
      preview: { alsoVisibleTo: [], removedFrom: [{ wsId: 'f', name: 'Sales' }] },
    });
    expect(html).toContain('It will no longer be readable in: Sales.');
    expect(html).not.toContain('Keep it readable');
  });

  it('says when nothing changes', () => {
    expect(lines({})).toContain('Who can see it does not change.');
  });
});
