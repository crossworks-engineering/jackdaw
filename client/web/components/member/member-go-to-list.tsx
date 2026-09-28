'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@mantle/web-ui/ui/button';
import { memberItemHref, probeMemberItem, resolveMemberItem } from '@/lib/member-space';

const LIST_NAME: Record<string, string> = {
  '/pages': 'Pages',
  '/notes': 'Notes',
  '/draw': 'Draw',
  '/tables': 'Tables',
};

/** A member opening an item's own route (/pages/<id>, /draw/<id>,
 *  /notes/<id>, /tables/<id>) or its permalink (/n/<id>, which the team
 *  agent cites) lands on the kind's member screen with the item selected:
 *  members have no separate detail routes (their editors live in the list's
 *  detail pane), and /api/nodes answers admins only. The link may point at an
 *  own item, a teammate's shared one, a Library item or one an admin
 *  accepted, so the source is found first (Mine, then Team drafts, the
 *  Library, Accepted), and with it the item's kind; an id no source has says
 *  so here instead of opening an empty Mine pane. `path` is the kind's screen
 *  the route named; a permalink names none. */
export function MemberGoToList({ path, id }: { path?: string; id: string }) {
  const router = useRouter();
  // What became of which id (a new id, or Try again, starts over).
  const [outcome, setOutcome] = useState<{ id: string; state: 'missing' | 'failed' } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state = outcome?.id === id ? outcome.state : null;
  useEffect(() => {
    let live = true;
    void resolveMemberItem(probeMemberItem(id)).then((found) => {
      if (!live) return;
      const href = found ? memberItemHref(found, id, path) : null;
      if (href) router.replace(href);
      else setOutcome({ id, state: found ? 'failed' : 'missing' });
    });
    return () => {
      live = false;
    };
  }, [router, path, id, attempt]);
  const back = path ?? '/';
  const backName = path ? `Back to ${LIST_NAME[path] ?? 'the list'}` : 'Back to your home';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {state === 'missing' ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            This item is gone, or it is not shared with you.
          </p>
          <Link href={back} className="text-sm underline underline-offset-4">
            {backName}
          </Link>
        </>
      ) : state === 'failed' ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            Could not open this item just now.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setOutcome(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Opening…</p>
      )}
    </div>
  );
}
