import { Suspense } from 'react';
import { SetPageTitle } from '@/components/layout/page-title';
import { ConnectorsClient } from './connectors-client';

/**
 * /settings/connectors — external MCP servers consumed as per-connector tool
 * groups. Data-free: ConnectorsClient fetches GET /api/mcp-connectors
 * (connectors + the known-servers catalog), mutates via POST/PATCH/DELETE
 * /api/mcp-connectors (+ /[slug]/sync, /[slug]/oauth/start). The OAuth
 * callback lands on the brain origin, not here.
 */
export default async function ConnectorsSettingsPage() {
  return (
    <>
      <SetPageTitle title="Connectors" />
      <Suspense>
        <ConnectorsClient />
      </Suspense>
    </>
  );
}
