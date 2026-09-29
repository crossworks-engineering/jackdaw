import { describe, expect, it } from 'vitest';
import { readerTableView } from './reader-table';

/**
 * A read-only viewer's table (client logins audit B13): the client's
 * allowlisted shape from a brain with the fixes, and the whole table record
 * from the member routes and from an older brain. Only the grid, the tabs
 * and the counts come out.
 */
const COLUMNS = [{ id: 'c1', name: 'Name', type: 'text' }];
const ROWS = [{ id: 'r1', cells: { c1: 'One' } }];
const TABS = [
  { id: 't1', name: 'First', rows: 40, columns: 1 },
  { id: 't2', name: 'Second', rows: 2, columns: 1 },
];

describe('readerTableView', () => {
  it('reads the allowlisted client shape', () => {
    expect(
      readerTableView({ columns: COLUMNS, rows: ROWS, tabs: TABS, tabId: 't2', rowCount: 1 }),
    ).toEqual({
      data: { columns: COLUMNS, rows: ROWS },
      tabs: [
        { id: 't1', name: 'First', rows: 40 },
        { id: 't2', name: 'Second', rows: 2 },
      ],
      tabId: 't2',
      docClipped: false,
      totalRows: 1,
    });
  });

  it('the allowlisted shape is clipped when rowCount says there is more', () => {
    const v = readerTableView({ columns: COLUMNS, rows: ROWS, rowCount: 500 });
    expect(v?.docClipped).toBe(true);
    expect(v?.totalRows).toBe(500);
    // No rowCount: the current tab's count, else the rows sent.
    expect(readerTableView({ columns: COLUMNS, rows: ROWS, tabs: TABS })?.totalRows).toBe(40);
    expect(readerTableView({ columns: COLUMNS, rows: ROWS })?.docClipped).toBe(false);
  });

  it('still reads the whole record an older brain sends, and keeps only the grid', () => {
    const record = {
      id: 'x',
      title: 'T',
      description: 'App export of SECRET-APP',
      tags: ['internal'],
      summary: 'SECRET SUMMARY',
      visibility: 'private',
      data: { columns: COLUMNS, rows: ROWS, aggregates: { c1: 'count' } },
      draft: { columns: COLUMNS, rows: [] },
      tabs: TABS,
      tabId: 't1',
      docClipped: true,
    };
    const v = readerTableView(record);
    expect(v).toEqual({
      data: { columns: COLUMNS, rows: ROWS, aggregates: { c1: 'count' } },
      tabs: [
        { id: 't1', name: 'First', rows: 40 },
        { id: 't2', name: 'Second', rows: 2 },
      ],
      tabId: 't1',
      docClipped: true,
      totalRows: 40,
    });
    expect(JSON.stringify(v)).not.toMatch(/SECRET|internal|private/);
  });

  it('neither shape: nothing to draw', () => {
    expect(readerTableView(null)).toBeNull();
    expect(readerTableView({ columns: COLUMNS })).toBeNull();
    expect(readerTableView({ data: { rows: ROWS } })).toBeNull();
    expect(readerTableView('table')).toBeNull();
  });
});
