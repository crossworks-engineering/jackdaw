import { SetPageTitle } from '@/components/layout/page-title';
import { UsersClient } from './users-client';

/**
 * Users: ways INTO the one brain, not tenants. What a login reads comes from
 * its workspaces. Data-free page: UsersClient fetches from GET /api/users
 * and changes logins via POST/PATCH/DELETE /api/users[/id] (+ /password for
 * resets).
 */
export default async function UsersSettingsPage() {
  return (
    <>
      <SetPageTitle title="Users" />
      <UsersClient />
    </>
  );
}
