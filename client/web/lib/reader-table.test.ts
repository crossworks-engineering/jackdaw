import { describe, expect, it } from 'vitest';
import { readerTableView } from './reader-table';

/**
 * A read-only viewer's table (client logins audit B13): the client's
 * allowlisted ClientSharedTable from a brain with the fixes, and the whole
 * table record from the member routes and from an older brain. Only the
 * grid, the tabs and the counts come out.
 */
const COLUMNS = [{ id: 'c1', name: 'Name', type: 'text' }];
const ROWS = [{ id: 'r1', cells: { c1: 'One' } }];
const TABS = [
  { id: 't1', name: 'First', rows: 40, columns: 1 },
  { id: 't2', name: 'Second', rows: 2, columns: 1 },
];
const VIEW_TABS = [
  { id: 't1', name: 'First', rows: 40 },
  { id: 't2', name: 'Second', rows: 2 },
];

describe('readerTableView', () => {
  it('reads the allowlisted client table', () => {
    expect(
      readerTableView({
        data: { columns: COLUMNS, rows: ROWS, aggregates: { c1: 'count' } },
        tabs: TABS,
        tabId: 't2',
        docClipped: false,
        rowCount: 1,
      }),
    ).toEqual({
      data: { columns: COLUMNS, rows: ROWS, aggregates: { c1: 'count' } },
      tabs: VIEW_TABS,
      tabId: 't2',
      docClipped: false,
      totalRows: 2,
    });
  });

  it('counts: the current tab, else rowCount, else the rows sent; clipped as the brain says', () => {
    const one = { data: { columns: COLUMNS, rows: ROWS } };
    expect(readerTableView({ ...one, tabs: TABS })?.totalRows).toBe(40);
    expect(readerTableView({ ...one, rowCount: 500, docClipped: true })).toMatchObject({
      totalRows: 500,
      docClipped: true,
    });
    expect(readerTableView(one)).toMatchObject({ totalRows: 1, docClipped: false, tabId: null });
  });

  it('reads the whole record an older brain sends, and keeps only the grid', () => {
    const record = {
      id: 'x',
      title: 'T',
      description: 'App export of SECRET-APP',
      tags: ['internal'],
      summary: 'SECRET SUMMARY',
      visibility: 'private',
      data: { columns: COLUMNS, rows: ROWS },
      draft: { columns: COLUMNS, rows: [{ id: 'd', cells: { c1: 'SECRET DRAFT' } }] },
      tabs: TABS,
      tabId: 't1',
      docClipped: true,
    };
    const v = readerTableView(record);
    expect(v).toEqual({
      data: { columns: COLUMNS, rows: ROWS },
      tabs: VIEW_TABS,
      tabId: 't1',
      docClipped: true,
      totalRows: 40,
    });
    expect(JSON.stringify(v)).not.toMatch(/SECRET|internal|private/);
  });

  it('no grid: nothing to draw', () => {
    expect(readerTableView(null)).toBeNull();
    expect(readerTableView({ columns: COLUMNS, rows: ROWS })).toBeNull();
    expect(readerTableView({ data: { rows: ROWS } })).toBeNull();
    expect(readerTableView('table')).toBeNull();
  });
});
