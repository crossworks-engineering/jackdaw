/**
 * Settings > MCP, the pure half: ONE screen for every user (workspaces W7b).
 * Every login has the one MCP surface in its own workspaces; there is no
 * per-login MCP or Write switch and no Team and client access list any more
 * (/api/mcp-logins answers 410).
 *
 * The screen reads one of two routes and shows the same layout either way:
 *
 *  - `brain`: an Admin user with the Settings area reads GET
 *    /api/mcp-settings (the box switch, the connector URL, every connected
 *    client), disconnects with DELETE /api/mcp-clients/:id;
 *  - `own`: any other user reads GET /api/member/mcp (its own connection
 *    info, the data sources of its workspaces, the clients IT connected),
 *    disconnects with DELETE /api/member/mcp/clients/:id.
 *
 * Pinned by mcp-screen.test.ts. The member wire shapes are
 * lib/contract/member-mcp.ts (a verbatim copy of the brain's).
 */

export type { MemberMcpClient, MemberMcpConnector, MemberMcpView } from './contract/member-mcp';
import type { MemberMcpClient, MemberMcpConnector, MemberMcpView } from './contract/member-mcp';

/** GET /api/mcp-settings: the brain's screen (an Admin user with Settings). */
export type McpSettings = {
  enabled: boolean;
  connectorUrl: string;
  clients: MemberMcpClient[];
};

/** Which route the screen reads: the brain's, or the login's own. */
export type McpSource = 'brain' | 'own';

/** What the one screen renders, whichever route it read. */
export type McpScreenView = {
  source: McpSource;
  /** The box-level remote MCP switch. Off, no MCP works. */
  remoteEnabled: boolean;
  connectorUrl: string;
  /** The brain's: every connected client. The login's own: the clients it
   *  connected, never another login's. */
  clients: MemberMcpClient[];
  /** The data sources the login's workspaces hold (own only; absent from a
   *  brain before them). */
  connectors?: MemberMcpConnector[];
};

export const MCP_SETTINGS_PATH = '/api/mcp-settings';
export const MEMBER_MCP_PATH = '/api/member/mcp';

/** The route the screen reads for a source. */
export function mcpViewPath(source: McpSource): string {
  return source === 'brain' ? MCP_SETTINGS_PATH : MEMBER_MCP_PATH;
}

/** The answer of either route, as the one screen reads it. The member
 *  route's `access` (always on since W7b) is not read. */
export function mcpScreenView(source: 'brain', data: McpSettings): McpScreenView;
export function mcpScreenView(source: 'own', data: MemberMcpView): McpScreenView;
export function mcpScreenView(source: McpSource, data: McpSettings | MemberMcpView): McpScreenView {
  if (source === 'brain') {
    const s = data as McpSettings;
    return { source, remoteEnabled: s.enabled, connectorUrl: s.connectorUrl, clients: s.clients };
  }
  const v = data as MemberMcpView;
  return {
    source,
    remoteEnabled: v.remoteEnabled,
    connectorUrl: v.connectorUrl,
    clients: v.clients,
    ...(v.connectors !== undefined ? { connectors: v.connectors } : {}),
  };
}

/** Disconnect one client: the brain's route, or the login's own. */
export function mcpClientPath(source: McpSource, id: string): string {
  const id_ = encodeURIComponent(id);
  return source === 'brain' ? `/api/mcp-clients/${id_}` : `${MEMBER_MCP_PATH}/clients/${id_}`;
}

/** The connect card while the box switch is off: the brain's screen holds
 *  the switch, a user's own says who turns it on. */
export function mcpOffText(source: McpSource): string {
  return source === 'brain'
    ? 'Off by default. The connector puts the tool surface on the public internet (behind OAuth sign-in and consent). Turn it on to get a URL to add to claude.ai.'
    : 'MCP is off on this brain. An admin turns it on in Settings > MCP.';
}

/** The connected clients card: whose clients it lists. */
export function mcpClientsText(source: McpSource): { title: string; hint: string } {
  return source === 'brain'
    ? {
        title: 'Connected clients',
        hint: 'Apps that have signed in and hold a live token. Disconnect to revoke access immediately.',
      }
    : {
        title: 'Your connected clients',
        hint: 'The MCP clients you signed in with. Disconnect one to end its access at once.',
      };
}

/** One line per data source: what its tools do. Writes run where the
 *  login's workspaces let it (W7b: no per-login Write switch). */
export function connectorLine(c: Pick<MemberMcpConnector, 'readTools' | 'writeTools'>): string {
  const reads = `${c.readTools} read tool${c.readTools === 1 ? '' : 's'}`;
  if (c.writeTools === 0) return reads;
  const writes =
    c.writeTools === 1 ? '1 tool that changes data' : `${c.writeTools} tools that change data`;
  return `${reads}, ${writes}`;
}

/** What a login reads over MCP (W6b): its own items are brain items in its
 *  private workspace, read with the normal tools. */
export const READ_LINE =
  'You read what your login can read: the items of your workspaces, your own work included.';

/** What a login changes over MCP since W7b: what its workspaces let it,
 *  with no switch of its own. */
export const WRITE_LINE = 'You change what your workspaces let you change, and nothing more.';

/** The Claude Code command that adds this brain with an API key. */
export function claudeCodeKeyCommand(connectorUrl: string): string {
  return `claude mcp add --transport http mantle ${connectorUrl} --header "Authorization: Bearer mtlk_..."`;
}

/** The Claude Code command that adds this brain and signs in with OAuth. */
export function claudeCodeOauthCommand(connectorUrl: string): string {
  return `claude mcp add --transport http mantle ${connectorUrl}`;
}

/**
 * Which side of the one screen a login reads: the brain's for an Admin user
 * with the Settings area (the brain classes /api/mcp-settings,
 * /api/mcp-clients and /api/mcp-status as `settings`), its own for a member. An Admin user without the
 * area is told so (`refused`); a client has no MCP yet (`none`); null while
 * the shell has not answered. A brain that names no role reads as an admin's.
 */
export function mcpSourceFor(
  role: 'admin' | 'member' | 'client' | null,
  settings: boolean,
): McpSource | 'refused' | 'none' | null {
  switch (role) {
    case 'admin':
      return settings ? 'brain' : 'refused';
    case 'member':
      return 'own';
    case 'client':
      return 'none';
    default:
      return null;
  }
}
