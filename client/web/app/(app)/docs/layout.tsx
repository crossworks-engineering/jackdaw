'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@mantle/web-ui/api-fetch';
import { MasterDetail } from '@mantle/web-ui/ui/master-detail';
import { SetPageTitle } from '@/components/layout/page-title';
import { DocsNav } from './docs-nav';
import type { ReaderNav } from '@/lib/docs-types';

/**
 * Shared frame for the docs reader: master-detail, navigation left, selected
 * doc right. Client-fetch (GET /api/docs/reader) — the markdown lives on the
 * SERVER's disk; this app is zero-secret and diskless.
 *
 * The left column is a nav TREE, not a list of `<ListCard>`s — a deliberate
 * exception (see `handover-resizable-columns.md` §3). `MasterDetail` owns the
 * boxes, not what goes in them.
 *
 * This is a Next.js layout, so the detail IS `children`: whichever of
 * `page.tsx` (the collection manager) or `[collection]/[...slug]/page.tsx` (one
 * doc) the route resolves to.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const navQuery = useQuery({
    queryKey: ['docs-reader-nav'],
    queryFn: () => apiFetch<{ nav: ReaderNav }>('/api/docs/reader'),
  });

  return (
    <>
      <SetPageTitle title="Docs" />
      <MasterDetail
        id="docs"
        // 300px, not the 340px default: the width this screen has always had,
        // and it is now only a starting point — the user owns it from here.
        defaultListSize="300px"
        list={
          navQuery.data ? (
            <DocsNav nav={navQuery.data.nav} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              {navQuery.isError ? 'Could not load the docs list.' : 'Loading docs…'}
            </p>
          )
        }
        detail={children}
      />
    </>
  );
}
