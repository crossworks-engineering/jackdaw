'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { probeMemberItem, resolveMemberSource, workspaceQuery } from '@/lib/member-space';

const LIST_NAME: Record<string, string> = { '/pages': 'Pages', '/draw': 'Draw' };

/** A member opening an item's own route (/pages/<id>, /draw/<id>) lands on
 *  the kind's member screen with the item selected: members have no separate
 *  detail routes (their editors live in the list's detail pane). The link may
 *  point at an own item, a teammate's shared one or a Library item, so the
 *  source is found first (Mine, then Team drafts, then the Library); an id no
 *  source has says so here instead of opening an empty Mine pane. */
export function MemberGoToList({ path, id }: { path: string; id: string }) {
  const router = useRouter();
  // The id no source had (a new id starts the search over).
  const [missingId, setMissingId] = useState<string | null>(null);
  const missing = missingId === id;
  useEffect(() => {
    let live = true;
    void resolveMemberSource(probeMemberItem(id)).then((src) => {
      if (!live) return;
      if (!src) {
        setMissingId(id);
        return;
      }
      router.replace(`${path}?${workspaceQuery('', { src, id })}`);
    });
    return () => {
      live = false;
    };
  }, [router, path, id]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {missing ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            This item is gone, or it is not shared with you.
          </p>
          <Link href={path} className="text-sm underline underline-offset-4">
            Back to {LIST_NAME[path] ?? 'the list'}
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Opening…</p>
      )}
    </div>
  );
}
