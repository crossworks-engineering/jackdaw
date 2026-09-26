'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** A member opening an item's own route (/pages/<id>, /draw/<id>) lands on
 *  the kind's member screen with the item selected: members have no separate
 *  detail routes (their editors live in the list's detail pane). */
export function MemberGoToList({ path, id }: { path: string; id: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${path}?id=${encodeURIComponent(id)}`);
  }, [router, path, id]);
  return null;
}
