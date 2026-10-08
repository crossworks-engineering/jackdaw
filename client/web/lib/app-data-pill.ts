/**
 * The R and R/W pill on an app in the app menus (brain team apps Phase 3):
 * what the VIEWER may do with the app's data. The brain works it out per
 * viewer with its db brokers' own rule and sends it as `dataAccess` on
 * every app list (the sidebar, the member and client launchers, a member's
 * own apps); this file only maps it to words. It never derives the rule. A
 * brain that sends no field gets no pill.
 *
 * `AppDataAccess` mirrors the brain's `@mantle/client-types/app-nav` type;
 * it lives here until the contract pin carries it.
 *
 * Pure, pinned by app-data-pill.test.ts.
 */
export type AppDataAccess = 'read' | 'read_write';

export type AppPill = {
  label: string;
  /** One plain sentence, for the tooltip and screen readers. */
  title: string;
  tone: 'read' | 'write' | 'info';
};

export const APP_READ_PILL: AppPill = {
  label: 'R',
  title: "You can read this app's data.",
  tone: 'read',
};

export const APP_READ_WRITE_PILL: AppPill = {
  label: 'R/W',
  title: "You can read and change this app's data.",
  tone: 'write',
};

export const APP_MCP_PILL: AppPill = {
  label: 'MCP',
  title: "MCP access is on: members' and clients' own MCP may reach this app's data.",
  tone: 'info',
};

/** The data pill for an app as the brain sent it, or null (an older brain,
 *  or a value this client does not know). */
export function appDataPill(app: object): AppPill | null {
  const v = (app as { dataAccess?: unknown }).dataAccess;
  if (v === 'read') return APP_READ_PILL;
  if (v === 'read_write') return APP_READ_WRITE_PILL;
  return null;
}

/** The MCP pill, for an admin's sidebar: only while the app's MCP access
 *  reaches anyone (`mcpReach`: on, published, below admin; access matrix
 *  N9). A brain before that field: while the switch is on. */
export function appMcpPill(app: object): AppPill | null {
  const a = app as { mcpAccess?: unknown; mcpReach?: unknown };
  const reach = typeof a.mcpReach === 'boolean' ? a.mcpReach : a.mcpAccess === true;
  return reach ? APP_MCP_PILL : null;
}
