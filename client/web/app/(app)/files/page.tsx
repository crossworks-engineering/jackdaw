import { Suspense } from 'react';
import { RoleSwitch } from '@/components/member/viewer-role';
import { MemberWorkspace } from '@/components/member/member-workspace';
import { AdminSpaces } from '@/components/member/admin-private-workspace';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { FilesClient } from './files-client';

/**
 * Files: data-free. FilesClient fetches the folder tree + the current folder's
 * files from the /api/files endpoints, resolves the `?path` param against the
 * tree, and derives the current folder — no SSR DB read. (The root branch is
 * ensured by those GET handlers.) Wrapped in Suspense because the client reads
 * `useSearchParams`.
 */
export default async function FilesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <RoleSwitch member={<MemberWorkspace kind="file" />}>
        <AdminSpaces kind="file">
          <FilesClient />
        </AdminSpaces>
      </RoleSwitch>
    </Suspense>
  );
}
