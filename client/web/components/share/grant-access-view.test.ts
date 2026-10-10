/**
 * The Grant Access panel's body (W5b2, plan 7.1): a Moderator gets the
 * controls (Write switch, remove, Change here, Restore, Move, Add
 * workspace, Grant these too, MCP access); a user who may not manage reads
 * the same rows with none. Bridge-kept rows are locked.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  APP_MCP_LABEL,
  BRIDGE_OWNED_TEXT,
  NO_ADDABLE_TEXT,
  READ_ONLY_PANEL_TEXT,
  type GrantsView,
} from '../../lib/grants';
import { GrantAccessView } from './grant-access-view';

const noop = () => {};
const handlers = {
  onWrite: noop,
  onRemove: noop,
  onRestore: noop,
  onHand: noop,
  onAdd: noop,
  onMove: noop,
  onGrantEmbeds: noop,
  onMcpAccess: noop,
};

function view(over: Partial<GrantsView> = {}): GrantsView {
  return {
    home: { wsId: 'team', name: 'Team' },
    rows: [
      {
        wsId: 'team',
        name: 'Team',
        write: true,
        isHome: true,
        viaFolder: null,
        excluded: false,
      },
      {
        wsId: 'sales',
        name: 'Sales',
        write: false,
        isHome: false,
        viaFolder: { id: 'f1', title: 'Plans' },
        excluded: false,
      },
      {
        wsId: 'board',
        name: 'Board',
        write: false,
        isHome: false,
        viaFolder: { id: 'f1', title: 'Plans' },
        excluded: true,
      },
      {
        wsId: 'ops',
        name: 'Ops',
        write: true,
        isHome: false,
        viaFolder: null,
        excluded: false,
      },
    ],
    addable: [
      { wsId: 'x', name: 'Xylo' },
      { wsId: 'admin', name: 'Admin' },
    ],
    mayManage: true,
    embedsNotGranted: [],
    ...over,
  };
}

const render = (v: GrantsView, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(GrantAccessView, {
      view: v,
      busy: false,
      adminWsId: 'admin',
      ...handlers,
      ...extra,
    }),
  );

describe('GrantAccessView for a Moderator', () => {
  const html = render(view());

  it('lists every workspace, home first', () => {
    expect(html.indexOf('>Team<')).toBeLessThan(html.indexOf('>Ops<'));
    expect(html.indexOf('>Ops<')).toBeLessThan(html.indexOf('>Sales<'));
    expect(html).toContain('Home: the item lives here');
  });

  it('a Write switch per row, a remove except on the home', () => {
    expect(html).toContain('aria-label="Users in Ops can change it"');
    expect(html).toContain('aria-label="Remove Ops"');
    expect(html).toContain('aria-label="Remove Sales"');
    expect(html).not.toContain('aria-label="Remove Team"');
  });

  it('a folder row says so and offers Change here', () => {
    expect(html).toContain('Via folder Plans');
    expect(html).toContain('Change here');
  });

  it('a removed folder row says Removed here, with Restore', () => {
    expect(html).toContain('Removed here (folder Plans grants it)');
    expect(html).toContain('Restore');
    expect(html).not.toContain('aria-label="Remove Board"');
  });

  it('the home row offers Move, and Add workspace shows', () => {
    expect(html).toContain('Move…');
    expect(html).toContain('Add workspace');
    expect(html).not.toContain(READ_ONLY_PANEL_TEXT);
  });

  it('says so when there is nothing to add', () => {
    expect(render(view({ addable: [] }))).toContain(NO_ADDABLE_TEXT);
  });

  it('lists embeds not granted, with Grant these too', () => {
    const out = render(
      view({ embedsNotGranted: [{ nodeId: 'e1', title: 'Site photo', kind: 'file' }] }),
    );
    expect(out).toContain('One item it embeds is not shared with the same workspaces.');
    expect(out).toContain('Site photo');
    expect(out).toContain('Grant these too');
  });

  it('an app words the Write switch for its data and shows MCP access', () => {
    const out = render(view({ app: { mcpAccess: true } }), { type: 'app' });
    expect(out).toContain('aria-label="Users in Ops can change its data"');
    expect(out).toContain(APP_MCP_LABEL);
    expect(out).toContain('aria-label="MCP access"');
  });

  it('a bridge-kept row is locked: no switch, no remove', () => {
    const v = view();
    v.rows = v.rows.map((r) => (r.wsId === 'ops' ? { ...r, bridgeOwned: true } : r));
    const out = render(v);
    expect(out).toContain(BRIDGE_OWNED_TEXT);
    expect(out).not.toContain('aria-label="Remove Ops"');
    expect(out).not.toContain('aria-label="Users in Ops can change it"');
  });
});

describe('GrantAccessView read only', () => {
  const html = render(
    view({
      mayManage: false,
      app: { mcpAccess: false },
      embedsNotGranted: [{ nodeId: 'e1', title: 'Site photo', kind: 'file' }],
    }),
  );

  it('says who can change it and shows the rows', () => {
    expect(html).toContain(READ_ONLY_PANEL_TEXT);
    expect(html).toContain('>Sales<');
    expect(html).toContain('Read only');
    expect(html).toContain('Can change');
  });

  it('has no controls at all', () => {
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('aria-label="Remove');
    expect(html).not.toContain('Add workspace');
    expect(html).not.toContain('Change here');
    expect(html).not.toContain('Restore');
    expect(html).not.toContain('Move…');
    expect(html).not.toContain('Grant these too');
  });
});

describe('GrantAccessView for a Moderator of one row only (contract 10)', () => {
  const html = render(view({ mayManage: false }), { moderated: new Set(['ops']) });

  it('the Ops row gets remove and its Write switch (to turn off)', () => {
    expect(html).toContain('aria-label="Remove Ops"');
    expect(html).toContain('aria-label="Users in Ops can change it"');
  });

  it('other rows stay read only, and no manage controls show', () => {
    expect(html).not.toContain('aria-label="Remove Sales"');
    expect(html).not.toContain('Add workspace');
    expect(html).not.toContain('Change here');
    expect(html).not.toContain('Move…');
  });
});
