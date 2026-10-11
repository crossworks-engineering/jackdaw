import { SetPageTitle } from '@/components/layout/page-title';
import { McpScreen } from './mcp-screen';

/**
 * /settings/mcp: the remote MCP connector, one screen for every user
 * (workspaces W7b). Data-free. An Admin user with the Settings area reads
 * the brain's side (GET /api/mcp-settings: the box switch, the connector URL,
 * every connected client; PATCH to toggle, DELETE /api/mcp-clients/[id],
 * POST /api/mcp-status); a member reads its own (GET /api/member/mcp: its
 * connection info, its data sources, the clients it connected). The same
 * layout either way (mcp-screen.tsx, lib/mcp-screen.ts).
 */
export default async function McpSettingsPage() {
  return (
    <>
      <SetPageTitle title="MCP connector" />
      <McpScreen />
    </>
  );
}
