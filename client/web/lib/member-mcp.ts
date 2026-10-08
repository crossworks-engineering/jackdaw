/**
 * A member's own view of Settings > MCP (brain team apps Phase 1): GET
 * /api/member/mcp, and their own disconnect (DELETE
 * /api/member/mcp/clients/:id). The pure half, pinned by member-mcp.test.ts:
 * the answer's shape, the access words and the connect commands.
 *
 * The types mirror `MemberMcpView` in @mantle/client-types (dto/member-mcp);
 * they live here until the contract pin carries them.
 */

export type MemberMcpClient = {
  id: string;
  clientName: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  activeTokens: number;
};

export type MemberMcpView = {
  /** The box-level remote MCP switch (an admin's). */
  remoteEnabled: boolean;
  connectorUrl: string;
  /** The member's own switches, set by an admin. */
  access: { enabled: boolean; writeEnabled: boolean };
  /** The clients this member connected, never another login's. */
  clients: MemberMcpClient[];
};

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
