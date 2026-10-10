import type { AppDetail } from '@mantle/client-types';
import { appAuthorLevel, showsTrustSwitch } from './space-apps';

/**
 * Whether an app has the admin's Trust its tools switch to show, so the
 * editor's App settings button shows only when there is something behind
 * it. Informational and MCP access moved into the Grant Access panel (W5b:
 * Informational is each grant's Write switch).
 */
export function hasAppSettings(app: AppDetail): boolean {
  return appAuthorLevel(app) !== null && showsTrustSwitch(app);
}
