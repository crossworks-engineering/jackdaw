import { SetPageTitle } from '@/components/layout/page-title';
import { McpScreen } from './mcp-screen';

/**
 * /settings/mcp: the remote MCP connector. Data-free. An admin with the
 * Connectors area gets the brain's screen, McpSettingsClient: GET
 * /api/mcp-settings (enabled flag, connector URL, connected clients), toggles
 * via PATCH, disconnects via DELETE /api/mcp-clients/[id], and health-checks
 * via POST /api/mcp-status. A member gets its own view, MemberMcpClient (GET
 * /api/member/mcp, until phase W7): no request of the brain's screen fires
 * for it (mcp-screen.tsx).
 */
export default async function McpSettingsPage() {
  return (
    <>
      <SetPageTitle title="MCP connector" />
      <McpScreen />
    </>
  );
}
