/**
 * A read-only viewer's table (the member Library, the client portal), the
 * pure half: what the viewer draws out of whatever shape the brain sent.
 * Pinned by reader-table.test.ts.
 */

/** A table tab as the viewer lists it. */
export type ReaderTableTab = { id: string; name: string; rows: number };

/** A table as a read-only viewer draws it: the grid (columns, rows and the
 *  owner's aggregates), the tabs, which one this is, and whether the rows
 *  are a leading window of `totalRows`. */
export type ReaderTableView = {
  data: { columns: unknown[]; rows: unknown[]; aggregates?: Record<string, unknown> };
  tabs: ReaderTableTab[];
  tabId: string | null;
  docClipped: boolean;
  totalRows: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function tableTabs(v: unknown): ReaderTableTab[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) =>
    isRecord(t) && typeof t.id === 'string'
      ? [
          {
            id: t.id,
            name: typeof t.name === 'string' ? t.name : '',
            rows: typeof t.rows === 'number' ? t.rows : 0,
          },
        ]
      : [],
  );
}

/**
 * A table payload as a read-only viewer draws it: `data` (the committed
 * grid), `tabs`, `tabId`, `docClipped` and `rowCount`. The member routes and
 * a brain before the client logins audit fixes send the whole table record;
 * a brain with the fixes sends a client only those fields
 * (ClientSharedTable, B13). Either way only the grid, the tabs and the
 * counts come out: nothing else of the record (description, tags, summary)
 * ever reaches the viewer. Null when there is no grid.
 */
export function readerTableView(table: unknown): ReaderTableView | null {
  if (!isRecord(table)) return null;
  const data = table.data;
  if (!isRecord(data) || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;
  const tabs = tableTabs(table.tabs);
  const tabId = typeof table.tabId === 'string' ? table.tabId : null;
  const current = tabId ?? tabs[0]?.id ?? null;
  // The current tab's own count first (a workbook), else the table's.
  const total =
    tabs.find((t) => t.id === current)?.rows ??
    (typeof table.rowCount === 'number' ? table.rowCount : data.rows.length);
  return {
    data: {
      columns: data.columns,
      rows: data.rows,
      ...(isRecord(data.aggregates) ? { aggregates: data.aggregates } : {}),
    },
    tabs,
    tabId,
    docClipped: table.docClipped === true,
    totalRows: Math.max(total, data.rows.length),
  };
}
