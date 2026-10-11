'use client';

import { Spinner } from '@mantle/web-ui/ui/spinner';
import { hasArea } from '@/lib/workspaces';
import { mcpSourceFor } from '@/lib/mcp-screen';
import { useViewerAreas } from '@/components/workspaces/use-shell-workspaces';
import { AreaRefused } from '@/components/workspaces/area-gate';
import { ClientEmpty, useShellRole } from '@/components/layout/shell-role';
import { McpSettingsClient } from './mcp-client';

/**
 * The one MCP screen (workspaces W7b), on the side this login reads
 * (mcpSourceFor): the brain's for an Admin user with the Connectors area,
 * its own for a member. An Admin user without the area is told so; a client
 * has no MCP yet.
 */
export function McpScreen() {
  const source = mcpSourceFor(useShellRole(), hasArea(useViewerAreas(), 'connectors'));
  switch (source) {
    case 'brain':
    case 'own':
      return <McpSettingsClient source={source} />;
    case 'refused':
      return <AreaRefused />;
    case 'none':
      return <ClientEmpty />;
    default:
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      );
  }
}
