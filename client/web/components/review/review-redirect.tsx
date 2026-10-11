'use client';

/**
 * Removed in W5c: review is gone, so an old Team admin > Review link
 * (`/team-admin?view=review`) lands on Home, as /review does. Kept ONLY
 * for app/(app)/team-admin/page.tsx, which a later W5c part removes;
 * delete this file then.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@mantle/web-ui/ui/spinner';

export function ReviewRedirect(_props: { item?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}
