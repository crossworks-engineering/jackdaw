import type { AppDetail } from '@mantle/client-types';
import { supportsInformational } from './app-informational';
import { appAuthorLevel, showsTrustSwitch } from './space-apps';

/**
 * Whether an app has the admin's switches to show (Informational, Trust its
 * tools), so the editor's App settings button shows only when there is
 * something behind it. MCP access is in the Grant Access panel (W5b2).
 */
export function hasAppSettings(app: AppDetail): boolean {
  return supportsInformational(app) || (appAuthorLevel(app) !== null && showsTrustSwitch(app));
}
