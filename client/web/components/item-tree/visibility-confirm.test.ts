/**
 * The confirm's list (W5b2 contract 29): a tree write lists each item with
 * the workspaces it gains and loses; a review accept still lists levels.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChangeList, TREE_CONFIRM_NOTE } from './visibility-confirm';

describe('ChangeList', () => {
  it('names the workspaces each item gains and loses', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeList, {
        label: 'Who can see each item',
        changes: [
          {
            id: 'a',
            title: 'Plan',
            alsoVisibleTo: [{ wsId: 's', name: 'Sales' }],
            removedFrom: [{ wsId: 't', name: 'Team' }],
          },
          {
            id: '',
            title: 'new.txt',
            alsoVisibleTo: [{ wsId: 's', name: 'Sales' }],
            removedFrom: [],
          },
        ],
        more: 2,
      }),
    );
    expect(html).toContain('Plan');
    expect(html).toContain('Also: <span class="font-medium">Sales</span>');
    expect(html).toContain('No longer: Team');
    expect(html).toContain('new.txt');
    expect(html).toContain('and 2 more');
    expect(html).not.toContain('becomes');
  });

  it('still shows a level change (review accept, until W5c)', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeList, {
        label: 'x',
        changes: [{ id: 'a', title: 'Plan', from: 'admin', to: 'team' }],
        more: 0,
      }),
    );
    expect(html).toContain('aria-label="becomes"');
    expect(html).toContain('Admin only');
  });

  it('the tree note speaks of workspaces, not shares', () => {
    expect(TREE_CONFIRM_NOTE).toBe('Items take the workspaces of the folder they sit in.');
  });
});
