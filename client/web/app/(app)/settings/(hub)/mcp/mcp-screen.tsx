'use client';

import { hasArea } from '@/lib/workspaces';
import { useViewerAreas } from '@/components/workspaces/use-shell-workspaces';
import { AreaRefused } from '@/components/workspaces/area-gate';
import { RoleSwitch } from '@/components/layout/shell-role';
import { McpSettingsClient } from './mcp-client';
import { MemberMcpClient } from './member-mcp-client';

/**
 * Which MCP screen this login gets (phase W5c, until per-login MCP in W7):
 * an admin with the Connectors area the brain's own (the box switch, Team
 * and client access), a member its own view (its access and the clients it
 * connected), a client the plain empty state (it reads no data routes). An
 * admin without the area is told so.
 */
export function McpScreen() {
  const connectors = hasArea(useViewerAreas(), 'connectors');
  return (
    <RoleSwitch member={<MemberMcpClient />}>
      {connectors ? <McpSettingsClient /> : <AreaRefused />}
    </RoleSwitch>
  );
}
