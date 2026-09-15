import type { ToolGroupIntegrationDTO } from '@mantle/client-types';

/**
 * TEMPORARY shim for contract fields the server ships but the pinned
 * `@crossworks/client-types` (0.232.105) does not know yet:
 *
 *   - MCP connector `oauth.client` (the pre-registered OAuth app: the
 *     Settings → Microsoft app, or one registered by hand) and `oauth.scope`
 *
 * Everything reads defensively (an older brain simply sends nothing), so this
 * file is safe against every server version. DELETE it, and read the fields
 * off `ToolGroupIntegrationDTO` directly, once the pin advances past the
 * mantle release that carries them.
 */

type McpOAuthPinned = NonNullable<NonNullable<ToolGroupIntegrationDTO['mcp']>['oauth']>;

export type McpOAuthClient =
  { source: 'microsoft' } | { source: 'manual'; authorizationServer?: string };

type McpOAuthNext = McpOAuthPinned & { client?: McpOAuthClient; scope?: string };

/** The connector's pre-registered app, or undefined when it registers itself. */
export function mcpOAuthApp(oauth: McpOAuthPinned | undefined): McpOAuthClient | undefined {
  return (oauth as McpOAuthNext | undefined)?.client;
}

/** The connector's scope override, if any. */
export function mcpOAuthScope(oauth: McpOAuthPinned | undefined): string | undefined {
  return (oauth as McpOAuthNext | undefined)?.scope;
}
