/**
 * A read-only viewer's table (the member Library, the client portal), the
 * pure half: what the viewer draws out of whatever shape the brain sent.
 * Pinned by reader-table.test.ts.
 */

/** A table tab as the viewer lists it. */
export type ReaderTableTab = { id: string; name: string; rows: number };

/** A table as a read-only viewer draws it: the grid (columns, rows and, in
 *  the whole-record shape, the owner's aggregates), the tabs, which one this
 *  is, and whether the rows are a leading window of `totalRows`. */
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
 * A table payload, read in either shape: the allowlisted ClientSharedTable
 * (`columns`, `rows`, `tabs`, `tabId`, `rowCount`) a brain with the client
 * logins audit fixes sends a client (B13), or the whole table record
 * (`data`, `tabs`, `tabId`, `docClipped`) the member routes send, and an
 * older brain sends a client. Only the grid, the tabs and the counts come
 * out: nothing else of the record (description, tags, summary) ever reaches
 * the viewer. Null when it is neither.
 */
export function readerTableView(table: unknown): ReaderTableView | null {
  if (!isRecord(table)) return null;
  const tabs = tableTabs(table.tabs);
  const tabId = typeof table.tabId === 'string' ? table.tabId : null;
  const current = tabId ?? tabs[0]?.id ?? null;
  const tabRows = tabs.find((t) => t.id === current)?.rows;
  if (Array.isArray(table.columns) && Array.isArray(table.rows)) {
    const total =
      typeof table.rowCount === 'number' ? table.rowCount : (tabRows ?? table.rows.length);
    return {
      data: { columns: table.columns, rows: table.rows },
      tabs,
      tabId,
      docClipped: total > table.rows.length,
      totalRows: Math.max(total, table.rows.length),
    };
  }
  const data = table.data;
  if (isRecord(data) && Array.isArray(data.columns) && Array.isArray(data.rows)) {
    return {
      data: {
        columns: data.columns,
        rows: data.rows,
        ...(isRecord(data.aggregates) ? { aggregates: data.aggregates } : {}),
      },
      tabs,
      tabId,
      docClipped: table.docClipped === true,
      totalRows: tabRows ?? data.rows.length,
    };
  }
  return null;
}
