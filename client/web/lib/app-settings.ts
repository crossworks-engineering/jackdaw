import type { AppDetail } from '@mantle/client-types';
import { supportsInformational } from './app-informational';
import { supportsMcpAccess, type WithMcpAccess } from './app-mcp-access';
import { appAuthorLevel, showsTrustSwitch } from './space-apps';

/**
 * Whether an app has any of the admin's switches to show (Informational,
 * MCP access, Trust its tools), so the editor's App settings button shows
 * only when there is something behind it. Each switch decides the same way
 * whether it renders.
 */
export function hasAppSettings(app: AppDetail): boolean {
  return (
    supportsInformational(app) ||
    supportsMcpAccess(app as AppDetail & WithMcpAccess) ||
    (appAuthorLevel(app) !== null && showsTrustSwitch(app))
  );
}
