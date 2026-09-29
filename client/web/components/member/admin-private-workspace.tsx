'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@mantle/web-ui/ui/spinner';
import { isPrivateView, legacyPrivateHref } from '@/lib/admin-private';
import type { SpaceKind } from '@/lib/member-space';

/**
 * An admin's screen for one kind. Since the item-list alignment an admin's
 * private items list INSIDE the owner screen (`children`), beside the brain's,
 * wearing a `private` pill (components/item-list/admin-private-rows.tsx);
 * there is no separate Private view and no Brain / Private switch any more.
 * An old Private-view link (`?space=private[&id=]`) still lands: it is
 * redirected to the screen filtered to private items, or with that item open.
 * Mounted inside RoleSwitch's admin branch, so a member never reaches it.
 */
export function AdminSpaces({ kind, children }: { kind: SpaceKind; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const legacy = isPrivateView(params);
  useEffect(() => {
    if (legacy) router.replace(legacyPrivateHref(kind, params), { scroll: false });
  }, [legacy, kind, params, router]);
  if (legacy) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return <>{children}</>;
}
