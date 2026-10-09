import { RoleSwitch } from '@/components/member/viewer-role';
import { MemberAppReviewClient } from './member-app-review-client';

/**
 * A member's app, as an admin reviews it (workspace review pattern): the
 * normal app screen's views (Builder, Code, History, Activity), read only,
 * with the banner and its actions. Data-free: MemberAppReviewClient reads
 * GET /api/apps/members/:id. A member never reaches it.
 */
export default async function MemberAppReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RoleSwitch
      member={
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          This page is for admins.
        </div>
      }
    >
      <MemberAppReviewClient id={id} />
    </RoleSwitch>
  );
}
