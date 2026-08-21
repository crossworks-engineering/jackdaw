import type { TableDetail, TableRow } from '@mantle/content-core/table-model';

/**
 * App table exports (mantle v0.232.14): a brain Table can be linked to a
 * mini-app as a derived, read-only view of one table in the app's own SQLite.
 * The server refuses every grid mutation on a linked table (AppBoundTableError);
 * metadata (title/tags/icon/sharing) stays editable.
 *
 * The pinned contract copy (@mantle/content-core — a `file:`-style COPY, see
 * docs/db-less-dev.md) predates the field, so it is typed here defensively.
 * When the next @crossworks/* contract release lands with `appLink` on
 * `TableRow`, delete this module and use the contract types directly.
 */
export type TableAppLink = { appId: string; appName: string | null; sqliteTable: string };

export type TableRowWithApp = TableRow & { appLink?: TableAppLink | null };
export type TableDetailWithApp = TableDetail & { appLink?: TableAppLink | null };
