import { SetPageTitle } from '@/components/layout/page-title';
import { RoleSwitch } from '@/components/member/viewer-role';
import { McpSettingsClient } from './mcp-client';
import { MemberMcpClient } from './member-mcp-client';

/**
 * /settings/mcp — the remote MCP connector. Data-free. An admin gets
 * McpSettingsClient: GET /api/mcp-settings (enabled flag, connector URL,
 * connected clients), toggles via PATCH, disconnects via DELETE
 * /api/mcp-clients/[id], and health-checks via POST /api/mcp-status. A member
 * gets their own view, MemberMcpClient (GET /api/member/mcp; brain team apps
 * Phase 1): no admin request fires for them.
 */
export default async function McpSettingsPage() {
  return (
    <>
      <SetPageTitle title="MCP connector" />
      <RoleSwitch member={<MemberMcpClient />}>
        <McpSettingsClient />
      </RoleSwitch>
    </>
  );
}
