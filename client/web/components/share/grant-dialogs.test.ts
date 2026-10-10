/**
 * The move dialog's lines (W5b2, 21.8 rows 1 and 9): what the item becomes
 * visible to, where it stops, and "Keep it readable in H" for the old home.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CREATE_HERE_TITLE, MOVE_TITLE, MovePreviewLines } from './grant-dialogs';

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

describe('MovePreviewLines, fix round 1', () => {
  const p = {
    alsoVisibleTo: [{ wsId: 's', name: 'Sales' }],
    removedFrom: [{ wsId: 'h', name: 'Team' }],
  };

  it('ticking Keep it readable changes the no-longer line', () => {
    const off = lines({ preview: p, oldHome: { wsId: 'h', name: 'Team' }, keep: false });
    expect(off).toContain('It will no longer be readable in: Team.');
    const on = lines({ preview: p, oldHome: { wsId: 'h', name: 'Team' }, keep: true });
    expect(on).not.toContain('It will no longer be readable in');
    expect(on).toContain('It stays readable in Team, read only.');
  });

  it('an app move says both effects of its new workspaces', () => {
    const html = lines({ preview: p, app: { holders: ['Board', 'Sales'] } });
    expect(html).toContain('This app&#x27;s data becomes visible to Sales.');
    expect(html).toContain('This app will then read only items that Board and Sales both hold.');
    expect(lines({ preview: p })).not.toContain('This app');
  });

  it('a create in a folder has its own title, not Move', () => {
    expect(CREATE_HERE_TITLE).toBe('Create here and change who can see it?');
    expect(MOVE_TITLE).not.toBe(CREATE_HERE_TITLE);
  });
});
