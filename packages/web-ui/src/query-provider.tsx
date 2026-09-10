'use client';

/**
 * TanStack Query provider — the client data layer for the frontend/backend
 * split (Phase 2 · Task 4). Screens converted off SSR fetch their data with
 * `useQuery` against `/api/**` and invalidate via the query client (replacing
 * the server's `revalidatePath`). One client per browser tab, kept in state so
 * Fast Refresh / re-renders don't mint a new cache.
 *
 * Conventions (see docs/client-data-fetching.md):
 *  - Query keys are arrays mirroring the URL: ['skills'], ['skills', id].
 *  - Mutations call the matching endpoint, then invalidate the affected keys.
 */
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onSignOut } from './sign-out';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Single-tenant, mostly-fresh data: don't refetch on every focus,
            // but treat data as stale after 30s so navigation re-validates.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  // Drop everything cached about the person signing out. Sign-out is a client
  // navigation, so this provider — and the whole cache under it — outlives the
  // session: without this the next owner to sign in on the same tab is first
  // painted the previous one's profile, messages and settings, straight from
  // cache and before any request comes back. A 401 bounce is a full page load
  // and never had the problem.
  useEffect(() => onSignOut(() => client.clear()), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
