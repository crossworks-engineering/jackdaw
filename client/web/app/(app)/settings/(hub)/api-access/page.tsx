import { SetPageTitle } from '@/components/layout/page-title';
import { ApiAccessClient } from './api-access-client';

/**
 * /settings/api-access: API keys for scripts and MCP clients (brain
 * migration 0232). Data-free: ApiAccessClient fetches GET /api/access-keys,
 * makes keys with POST and revokes with DELETE /api/access-keys/:id.
 */
export default async function ApiAccessPage() {
  return (
    <>
      <SetPageTitle title="API access" />
      <ApiAccessClient />
    </>
  );
}
