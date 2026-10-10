/**
 * A member's own view of Settings > MCP (brain team apps Phase 1): GET
 * /api/member/mcp, and their own disconnect (DELETE
 * /api/member/mcp/clients/:id). The pure half, pinned by member-mcp.test.ts:
 * the answer's shape, the access words and the connect commands.
 *
 * The wire shapes are lib/contract/member-mcp.ts: a verbatim copy of mantle
 * packages/client-types/src/dto/member-mcp.ts (brain W5b2 part B,
 * 69a2ccd15). A connector carries no level any more (contract 28): the
 * member's workspaces decide which connectors they reach.
 */

export type { MemberMcpClient, MemberMcpConnector, MemberMcpView } from './contract/member-mcp';
import type { MemberMcpConnector, MemberMcpView } from './contract/member-mcp';

/** One line per connector: what the member may do with it, from their
 *  Write switch. */
export function connectorLine(
  c: Pick<MemberMcpConnector, 'readTools' | 'writeTools'>,
  writeEnabled: boolean,
): string {
  const reads = `${c.readTools} read tool${c.readTools === 1 ? '' : 's'}`;
  if (c.writeTools === 0) return reads;
  const writes =
    c.writeTools === 1 ? '1 tool that changes data' : `${c.writeTools} tools that change data`;
  const need = c.writeTools === 1 ? 'needs' : 'need';
  return writeEnabled
    ? `${reads}, ${writes}`
    : `${reads}; ${writes} ${need} the Write switch on your MCP`;
}

export const MEMBER_MCP_PATH = '/api/member/mcp';

/** The connect card while MCP is not open to the member (the box switch or
 *  their own is off). Why is said once, under Your access. */
export const MEMBER_MCP_NOT_OPEN =
  'You can connect a client once MCP is open to you. Your access, below, says why it is not.';

export function memberMcpClientPath(id: string): string {
  return `${MEMBER_MCP_PATH}/clients/${encodeURIComponent(id)}`;
}

/** What the member may do over MCP, in one line each, from their switches
 *  and the box's. */
export function memberMcpAccessLines(view: Pick<MemberMcpView, 'remoteEnabled' | 'access'>): {
  state: 'off' | 'read' | 'write';
  lines: string[];
} {
  if (!view.remoteEnabled) {
    return {
      state: 'off',
      lines: ['MCP is off on this brain. An admin turns it on in Settings > MCP.'],
    };
  }
  if (!view.access.enabled) {
    return {
      state: 'off',
      lines: ['MCP is off for your login. Ask an admin of this brain to turn it on.'],
    };
  }
  if (!view.access.writeEnabled) {
    return {
      state: 'read',
      lines: [
        'You read what your login can read.',
        'You read the data of the mini apps an admin opened to MCP.',
        'You cannot change anything over MCP.',
      ],
    };
  }
  return {
    state: 'write',
    lines: [
      'You read what your login can read.',
      'You make drafts in your own space, for review.',
      'You change rows in the mini apps an admin opened to MCP, unless an app is informational or public.',
      'You build your own mini apps with the my_app tools. They stay private until you share or submit them.',
    ],
  };
}

/** The Claude Code command that adds this brain with an API key. */
export function claudeCodeKeyCommand(connectorUrl: string): string {
  return `claude mcp add --transport http mantle ${connectorUrl} --header "Authorization: Bearer mtlk_..."`;
}

/** The Claude Code command that adds this brain and signs in with OAuth. */
export function claudeCodeOauthCommand(connectorUrl: string): string {
  return `claude mcp add --transport http mantle ${connectorUrl}`;
}
