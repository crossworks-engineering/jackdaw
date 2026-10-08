/**
 * MCP access on a mini app (brain team apps Phase 1, migration 0234): a
 * member's or client's own MCP connection reaches the app's data (the brain's
 * app_data_* tools) only while an admin has this on. Off by default. Who
 * reaches it is who runs it in the browser; read or write follows the
 * login's Write switch and the app's Informational flag.
 *
 * The pure half, pinned by app-mcp-access.test.ts: what the admin's switch
 * reads and sends, and its words.
 */

/** The flag on the owner's app detail. Optional: a brain before Phase 1
 *  sends none (and the contract pin may not list it yet). */
export type WithMcpAccess = {
  mcpAccess?: boolean | null;
  audience?: string | null;
  inherited?: string | null;
};

/** The owner's PATCH /api/apps/:id body that sets it. */
export type AppMcpAccessPatch = { mcpAccess: boolean };

export const APP_MCP_ACCESS_LABEL = 'MCP access: members and clients reach its data over MCP';
export const APP_MCP_ACCESS_HINT =
  'From their own MCP client, at their level. Read only unless their Write switch is on and the app is not informational.';

/** Is the admin's switch shown: the brain knows the flag, and someone other
 *  than an admin can run the app (its level, or a folder share). An admin
 *  app has no other readers. */
export function supportsMcpAccess(app: WithMcpAccess): boolean {
  if (typeof app.mcpAccess !== 'boolean') return false;
  const open = (l: string | null | undefined) => l === 'team' || l === 'client' || l === 'public';
  return open(app.audience) || open(app.inherited);
}

/** Is it on: only when the brain says so. */
export function isMcpAccessOn(app: WithMcpAccess | null | undefined): boolean {
  return app?.mcpAccess === true;
}

/** The owner app PATCH body for the switch. */
export function mcpAccessPatch(on: boolean): AppMcpAccessPatch {
  return { mcpAccess: on };
}
