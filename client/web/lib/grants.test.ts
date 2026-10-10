/**
 * Grants (W5b2): the rules the Grant Access panel, the chips, the folder
 * confirm and the move dialog follow.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@mantle/web-ui/api-fetch';
import {
  alsoVisibleLine,
  appHolderLines,
  chipsOf,
  folderConfirmText,
  folderPreviewUrl,
  grantErrorCode,
  grantErrorText,
  lostSight,
  moveChangesAccess,
  removedLine,
  rowActions,
  rowActionsFor,
  addRequest,
  removeRequest,
  folderConfirm,
  isItemGone,
  isNoGrants,
  uploadVisibleTo,
  uploadLine,
  appMoveLines,
  needsConfirm,
  rowNote,
  skippedText,
  sortAddable,
  sortRows,
  withConfirm,
  workspacesOf,
  type GrantRow,
} from './grants';

const row = (over: Partial<GrantRow> = {}): GrantRow => ({
  wsId: 'w1',
  name: 'Sales',
  write: false,
  isHome: false,
  viaFolder: null,
  excluded: false,
  ...over,
});

describe('rows', () => {
  it('home first, removed rows last, else by name', () => {
    const rows = [
      row({ wsId: 'z', name: 'Zed' }),
      row({ wsId: 'x', name: 'Alpha', excluded: true, viaFolder: { id: 'f', title: 'F' } }),
      row({ wsId: 'h', name: 'Team', isHome: true }),
      row({ wsId: 'b', name: 'Beta' }),
    ];
    expect(sortRows(rows).map((r) => r.wsId)).toEqual(['h', 'b', 'z', 'x']);
  });

  it('says where a row comes from', () => {
    expect(rowNote(row({ isHome: true }))).toBe('Home: the item lives here');
    expect(rowNote(row({ viaFolder: { id: 'f', title: 'Plans' } }))).toBe('Via folder Plans');
    expect(rowNote(row({ viaFolder: { id: 'f', title: null } }))).toBe(
      'Via folder a folder you cannot open',
    );
    expect(rowNote(row({ excluded: true, viaFolder: { id: 'f', title: 'Plans' } }))).toBe(
      'Removed here (folder Plans grants it)',
    );
    expect(rowNote(row())).toBeNull();
  });

  it('the home row has no remove, only Move; its Write switch works', () => {
    expect(rowActions(row({ isHome: true }))).toEqual({
      write: true,
      remove: false,
      restore: false,
      changeHere: false,
      move: true,
    });
  });

  it('a folder row offers Change here, not its Write switch', () => {
    expect(rowActions(row({ viaFolder: { id: 'f', title: 'F' } }))).toMatchObject({
      write: false,
      remove: true,
      changeHere: true,
    });
  });

  it('a removed row offers only Restore', () => {
    expect(rowActions(row({ excluded: true, viaFolder: { id: 'f', title: 'F' } }))).toEqual({
      write: false,
      remove: false,
      restore: true,
      changeHere: false,
      move: false,
    });
  });

  it('a bridge-kept row offers nothing (409 bridge_owned)', () => {
    expect(rowActions(row({ bridgeOwned: true, isHome: true }))).toEqual({
      write: false,
      remove: false,
      restore: false,
      changeHere: false,
      move: false,
    });
  });

  it('Add workspace lists Admin first for an Admin user (21.8), then by name', () => {
    const addable = [
      { wsId: 's', name: 'Sales' },
      { wsId: 'a', name: 'Admin' },
      { wsId: 'b', name: 'Board' },
    ];
    expect(sortAddable(addable, 'a').map((w) => w.wsId)).toEqual(['a', 'b', 's']);
    expect(sortAddable(addable, null).map((w) => w.wsId)).toEqual(['a', 'b', 's']);
    expect(sortAddable([{ wsId: 'z', name: 'Zed' }, ...addable], 'z')[0]!.wsId).toBe('z');
  });
});

describe('chips', () => {
  it('reads workspaces from any row, and none from an older brain', () => {
    expect(workspacesOf({ workspaces: [{ id: 'a', name: 'A' }, { bad: 1 }] })).toEqual([
      { id: 'a', name: 'A' },
    ]);
    expect(workspacesOf({ audience: 'team' })).toEqual([]);
    expect(workspacesOf(null)).toEqual([]);
  });

  it('three chips by name, then +N; the title names them all', () => {
    const ws = ['Delta', 'Alpha', 'Echo', 'Bravo'].map((n) => ({ id: n, name: n }));
    const c = chipsOf(ws);
    expect(c.shown.map((w) => w.name)).toEqual(['Alpha', 'Bravo', 'Delta']);
    expect(c.more).toBe(1);
    expect(c.title).toBe('Shared with: Alpha, Bravo, Delta, Echo');
  });
});

describe('folder confirm', () => {
  it('builds the preview URL of one change', () => {
    expect(folderPreviewUrl('f1', { add: 'w2', name: 'Sales' })).toBe(
      '/api/grants/f1/preview?add=w2',
    );
    expect(folderPreviewUrl('f1', { remove: 'w2', name: 'Sales' })).toBe(
      '/api/grants/f1/preview?remove=w2',
    );
  });

  it('says how many items gain or lose a workspace', () => {
    const add = { add: 'w', name: 'Sales' };
    expect(folderConfirmText(add, { gain: 12, lose: 0, tooBig: false })).toBe(
      '12 items gain Sales.',
    );
    expect(folderConfirmText(add, { gain: 1, lose: 0, tooBig: false })).toBe('1 item gains Sales.');
    expect(
      folderConfirmText({ remove: 'w', name: 'Sales' }, { gain: 0, lose: 3, tooBig: false }),
    ).toBe('3 items lose Sales.');
    expect(folderConfirmText(add, { gain: 0, lose: 0, tooBig: false })).toBe(
      'No item in it changes.',
    );
  });

  it('an app holder add says both effects (21.8 row 13), with or without counts', () => {
    expect(appHolderLines('Admin', ['Team'], { rows: 40, exportedTables: 2 })).toEqual([
      "This app's data (40 rows, 2 exported tables) becomes visible to Admin.",
      'This app will then read only items that Team and Admin both hold.',
    ]);
    expect(appHolderLines('Admin', ['Team'], { rows: null, exportedTables: 0 })[0]).toBe(
      "This app's data becomes visible to Admin.",
    );
    expect(appHolderLines('Ops', ['Team', 'Admin'])[1]).toBe(
      'This app will then read only items that Team, Admin and Ops all hold.',
    );
    expect(appHolderLines('Sales', [])).toEqual([
      "This app's data becomes visible to Sales.",
      'This app will then read only items that Sales holds.',
    ]);
  });

  it('adds confirm=1 to a URL', () => {
    expect(withConfirm('/api/grants/a/b', true)).toBe('/api/grants/a/b?confirm=1');
    expect(withConfirm('/api/grants/a/b', false)).toBe('/api/grants/a/b');
  });
});

describe('move', () => {
  const p = {
    alsoVisibleTo: [{ wsId: 'c', name: 'Client A' }],
    removedFrom: [{ wsId: 'h', name: 'Team' }],
  };
  it('says what it becomes visible to and where it stops', () => {
    expect(alsoVisibleLine(p)).toBe('This will also be visible to: Client A.');
    expect(removedLine(p)).toBe('It will no longer be readable in: Team.');
    expect(moveChangesAccess(p)).toBe(true);
    expect(moveChangesAccess({ alsoVisibleTo: [], removedFrom: [] })).toBe(false);
    expect(alsoVisibleLine({ alsoVisibleTo: [] })).toBeNull();
  });
});

describe('writes and errors', () => {
  it('knows the { visible: false } answer and counts skipped embeds', () => {
    expect(lostSight({ visible: false })).toBe(true);
    expect(lostSight({ rows: [] })).toBe(false);
    expect(skippedText([])).toBeNull();
    const sk = (code: string) => ({ nodeId: 'n', wsId: 'w', code });
    expect(skippedText([sk('forbidden'), sk('forbidden')])).toBe(
      '2 embeds were not shared: you may not share it there.',
    );
    expect(skippedText([sk('bridge_owned')])).toBe(
      'One embed was not shared: it follows its level until grants become the truth.',
    );
    // An embedded app is asked again, not reported as refused.
    expect(skippedText([sk('confirm_required')])).toBeNull();
    expect(needsConfirm([sk('forbidden'), sk('confirm_required')])).toEqual([
      sk('confirm_required'),
    ]);
  });

  it('shows the brain words as is and reads the code', () => {
    const e = new ApiError('This folder holds too many items.', 409, {
      error: 'This folder holds too many items.',
      code: 'too_big',
    });
    expect(grantErrorText(e, 'x')).toBe('This folder holds too many items.');
    expect(grantErrorCode(e)).toBe('too_big');
    expect(isItemGone(e)).toBe(false);
    expect(grantErrorText(new Error('boom'), 'Could not share it')).toBe('Could not share it');
  });
});

describe('who may change a row (contract 10)', () => {
  it('a Moderator of only that workspace may remove the row or turn Write off', () => {
    expect(rowActionsFor(row({ write: true }), false, true)).toMatchObject({
      write: true,
      remove: true,
      changeHere: false,
      restore: false,
      move: false,
      writeOffOnly: true,
    });
    // Write is off already: nothing to turn off, only remove.
    expect(rowActionsFor(row({ write: false }), false, true)).toMatchObject({
      write: false,
      remove: true,
    });
  });

  it('not on the home, a bridge row or a row they do not moderate', () => {
    expect(rowActionsFor(row({ isHome: true }), false, true).remove).toBe(false);
    expect(rowActionsFor(row({ bridgeOwned: true }), false, true).remove).toBe(false);
    expect(rowActionsFor(row(), false, false).remove).toBe(false);
  });
});

describe('what a write sends', () => {
  it('a folder add and an app add send confirm, a plain add does not', () => {
    expect(addRequest('f', 'w', 'branch').body).toEqual({ wsId: 'w', confirm: true });
    expect(addRequest('a', 'w', 'app').body).toEqual({ wsId: 'w', confirm: true });
    expect(addRequest('p', 'w', 'page')).toEqual({
      url: '/api/grants/p',
      method: 'POST',
      body: { wsId: 'w' },
    });
  });

  it('a folder remove goes with ?confirm=1', () => {
    expect(removeRequest('f', 'w', 'branch').url).toBe('/api/grants/f/w?confirm=1');
    expect(removeRequest('p', 'w', 'page').url).toBe('/api/grants/p/w');
  });

  it('a too-big folder blocks the confirm, with the words to share sub-folders', () => {
    const c = folderConfirm({ add: 'w', name: 'Sales' }, { gain: 0, lose: 0, tooBig: true });
    expect(c.blocked).toBe(true);
    expect(c.lines[0]).toContain('Share the sub-folders one by one');
    expect(folderConfirm({ add: 'w', name: 'Sales' }, { gain: 2, lose: 0, tooBig: false })).toEqual(
      { title: 'Share this folder with Sales?', lines: ['2 items gain Sales.'], blocked: false },
    );
  });

  it('an old brain (no code) is told apart from a hidden item (a code)', () => {
    const old = new ApiError('Not found', 404);
    const gone = new ApiError('not found', 404, { error: 'not found', code: 'not_found' });
    expect(isNoGrants(old)).toBe(true);
    expect(isItemGone(old)).toBe(false);
    expect(isNoGrants(gone)).toBe(false);
    expect(isItemGone(gone)).toBe(true);
  });
});

describe('upload into a folder (S6)', () => {
  it('names every workspace when the folder is shared beyond its home', () => {
    const rows = [
      row({ wsId: 'h', name: 'Admin', isHome: true }),
      row({ wsId: 's', name: 'Sales' }),
      row({ wsId: 'x', name: 'Board', excluded: true, viaFolder: { id: 'f', title: 'F' } }),
    ];
    expect(uploadVisibleTo({ rows })).toEqual(['Admin', 'Sales']);
    expect(uploadLine(['Admin', 'Sales'], 2)).toBe(
      'These 2 files will also be visible to: Admin, Sales.',
    );
  });

  it('asks nothing for a folder only its home reads', () => {
    expect(uploadVisibleTo({ rows: [row({ isHome: true })] })).toBeNull();
    expect(uploadVisibleTo(null)).toBeNull();
  });
});

describe('an app move (S7)', () => {
  it('says both effects', () => {
    expect(appMoveLines(['Sales'], ['Team', 'Sales'])).toEqual([
      "This app's data becomes visible to Sales.",
      'This app will then read only items that Team and Sales both hold.',
    ]);
    expect(appMoveLines(['Sales'])[1]).toBe(
      'This app will then read only items that every workspace it is in holds.',
    );
  });
});
