import type { AppDetail } from '@mantle/client-types';
import { supportsInformational } from './app-informational';
import { appAuthorLevel, showsTrustSwitch } from './space-apps';

/**
 * Whether an app has the admin's switches to show (Informational, Trust its
 * tools), so the editor's App settings button shows only when there is
 * something behind it. MCP access is in the Grant Access panel (W5b2).
 * `admin`: the login is an Admin user. The three switches are an Admin
 * user's only (W6b fix round: the brain answers 403 admin-only to anyone
 * else), so a member or a client sees none of them.
 */
export function hasAppSettings(app: AppDetail, admin = true): boolean {
  if (!admin) return false;
  return supportsInformational(app) || (appAuthorLevel(app) !== null && showsTrustSwitch(app));
}
